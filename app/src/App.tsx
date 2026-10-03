import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useHashRoute } from "./hooks";
import { useActors, type ActorId, type SendResult } from "./actors";
import { useVenue } from "./data";
import { useChainNow } from "./hooks";
import { PROGRAM_ID, errorMessage, explorerAddr, explorerTx, short, statusOf } from "./solana";
import { Avatar, Icon, Spinner } from "./ui";
import Overview from "./pages/Overview";
import Venue from "./pages/Venue";
import ShiftView from "./pages/ShiftView";
import TipPage from "./pages/TipPage";

// ---------------------------------------------------------------------------
// transactions: one at a time, every one gets a toast with an Explorer link
// ---------------------------------------------------------------------------
interface Toast {
  id: number;
  kind: "ok" | "err" | "info" | "blocked";
  text: string;
  sig?: string;
}
type Run = (label: string, fn: () => Promise<SendResult>, opts?: { expectFail?: boolean }) => Promise<SendResult | null>;
interface TxCtx {
  run: Run;
  /** Label of the transaction in flight; action buttons are disabled while set. */
  pending: string | null;
  /** Bumps after every transaction so pages refetch right away. */
  tick: number;
}
const Tx = createContext<TxCtx>({ run: async () => null, pending: null, tick: 0 });
export const useTx = () => useContext(Tx);

export default function App() {
  const [route] = useHashRoute();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const busy = useRef(false);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.filter((x) => x.kind !== "info"), { ...t, id }].slice(-3));
    if (t.kind !== "info") setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 12000);
  }, []);

  const run = useCallback<Run>(
    async (label, fn, opts = {}) => {
      if (busy.current) return null;
      busy.current = true;
      setPending(label);
      push({ kind: "info", text: `${label}…` });
      try {
        const r = await fn();
        if (!r.failed) push({ kind: "ok", text: `${label}: confirmed`, sig: r.signature });
        else if (opts.expectFail) push({ kind: "blocked", text: `Blocked on-chain: ${r.reason}`, sig: r.signature });
        else push({ kind: "err", text: `${label} failed: ${r.reason}`, sig: r.signature });
        return r;
      } catch (e) {
        console.error(e);
        const msg = errorMessage(e);
        push({ kind: "err", text: /reject|cancel/i.test(msg) ? `${label}: cancelled in wallet` : `${label} failed: ${msg}` });
        return null;
      } finally {
        busy.current = false;
        setPending(null);
        setTick((n) => n + 1);
      }
    },
    [push],
  );

  useEffect(() => setMenuOpen(false), [route.join("/")]);

  const page =
    route[0] === "venue" || route[0] === "owner" ? (
      <Venue />
    ) : route[0] === "shift" && route[1] ? (
      <ShiftView address={route[1]} />
    ) : route[0] === "tip" && route[1] ? (
      <TipPage address={route[1]} />
    ) : (
      <Overview />
    );

  return (
    <Tx.Provider value={{ run, pending, tick }}>
      {route[0] === "tip" ? (
        <div className="guest-shell">{page}</div>
      ) : (
        <div className={`shell ${menuOpen ? "menu-open" : ""}`}>
          <header className="mobile-bar">
            <button className="icon-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
              <Icon name="menu" size={18} />
            </button>
            <span className="mobile-title">Napiwek</span>
          </header>
          <Sidebar route={route} />
          <div className="scrim" onClick={() => setMenuOpen(false)} />
          <main className="page">{page}</main>
        </div>
      )}

      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === "info" ? <Spinner /> : <Icon name={t.kind === "ok" ? "check" : t.kind === "blocked" ? "shield" : "alert"} size={15} />}
            <span>{t.text}</span>
            {t.sig && (
              <a href={explorerTx(t.sig)} target="_blank" rel="noreferrer">
                View
              </a>
            )}
          </div>
        ))}
      </div>
    </Tx.Provider>
  );
}

function Sidebar({ route }: { route: string[] }) {
  const { owner } = useActors();
  const { tick } = useTx();
  const now = useChainNow();
  const { venue, shifts } = useVenue(owner.publicKey, tick, 20000);
  const here = route.join("/");

  return (
    <aside className="sidebar">
      <div className="workspace">
        <span className="ws-mark">N</span>
        <span className="ws-name">Napiwek</span>
        <span className="ws-net">Devnet</span>
      </div>

      <nav className="nav">
        <a className={`nav-item ${here === "" ? "on" : ""}`} href="#/">
          <Icon name="home" /> Overview
        </a>
        <a className={`nav-item ${route[0] === "venue" || route[0] === "owner" ? "on" : ""}`} href="#/venue">
          <Icon name="store" /> {venue?.name ?? "Venue"}
        </a>
      </nav>

      {shifts.length > 0 && (
        <nav className="nav">
          <div className="nav-heading">Shifts</div>
          {shifts.slice(0, 8).map(({ key, acc }) => {
            const st = statusOf(acc, now);
            return (
              <a key={key.toBase58()} className={`nav-item ${here === `shift/${key.toBase58()}` ? "on" : ""}`} href={`#/shift/${key.toBase58()}`}>
                <span className={`dot tone-${st.tone}`} title={st.label} />
                <span className="truncate">{acc.label || `Shift ${acc.index.toNumber() + 1}`}</span>
              </a>
            );
          })}
        </nav>
      )}

      <div className="sidebar-foot">
        <SignerMenu />
        <WalletMultiButton />
        <a className="foot-link" href={explorerAddr(PROGRAM_ID)} target="_blank" rel="noreferrer">
          Program {short(PROGRAM_ID)}
        </a>
      </div>
    </aside>
  );
}

/** Who signs the next transaction. A dropdown like a workspace/account switcher. */
export function SignerMenu({ only }: { only?: ActorId[] }) {
  const { actors, active, setActive } = useActors();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const list = only ? actors.filter((a) => only.includes(a.id)) : actors;

  return (
    <div className="signer" ref={ref}>
      <div className="signer-label">Signing as</div>
      <button className="signer-btn" onClick={() => setOpen((o) => !o)}>
        <Avatar name={active.name} seed={active.id} />
        <span className="signer-text">
          <span className="signer-name">{active.name}</span>
          <span className="signer-role">{active.role}</span>
        </span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="menu">
          {list.map((a) => (
            <button
              key={a.id}
              className="menu-item"
              disabled={!a.publicKey}
              onClick={() => {
                setActive(a.id);
                setOpen(false);
              }}
            >
              <Avatar name={a.name} seed={a.id} />
              <span className="signer-text">
                <span className="signer-name">{a.name}</span>
                <span className="signer-role">{a.publicKey ? `${a.role} · ${short(a.publicKey)}` : "Connect a wallet first"}</span>
              </span>
              {a.id === active.id && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
