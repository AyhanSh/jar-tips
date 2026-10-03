import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useChainNow, useHashRoute } from "./hooks";
import { useActors, type ActorId, type SendResult } from "./actors";
import { TeamProvider, useMyTeam, useShiftTeam, useTeamData, type TeamData } from "./data";
import { PROGRAM_ID, errorMessage, explorerAddr, explorerTx, parseKey, short, statusOf } from "./solana";
import { Avatar, Icon, Spinner } from "./ui";
import { Tour, useTour } from "./Tour";
import { DEMO_SHIFT, DemoMode } from "./demo";
import Overview from "./pages/Overview";
import Team from "./pages/Team";
import ShiftView from "./pages/ShiftView";
import TipPage from "./pages/TipPage";

// ---------------------------------------------------------------------------
// transactions: one at a time, every one gets a toast with an Explorer link
// ---------------------------------------------------------------------------
interface Toast {
  id: number;
  kind: "ok" | "err" | "info" | "blocked" | "demo";
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
/** Starts the guided tour. */
export const HelpCtx = createContext<() => void>(() => {});
export const useTx = () => useContext(Tx);

const TOAST_TITLE: Record<Toast["kind"], string> = {
  info: "Waiting for confirmation",
  ok: "Transaction confirmed",
  err: "Transaction failed",
  blocked: "Blocked by the program",
  demo: "Guide demo",
};

export default function App() {
  const [route] = useHashRoute();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const busy = useRef(false);
  const tour = useTour();
  const demo = useRef(false);
  demo.current = tour.open;
  // Leaving the guide: drop the sample data and start from the real (possibly empty) team.
  const endTour = useCallback(() => {
    tour.close();
    if (window.location.hash.includes(DEMO_SHIFT.toBase58()) || /^#\/(shift|team|venue)/.test(window.location.hash))
      window.location.hash = "/team";
  }, [tour]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.filter((x) => x.kind !== "info"), { ...t, id }].slice(-3));
    if (t.kind !== "info") setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 12000);
  }, []);

  const run = useCallback<Run>(
    async (label, fn, opts = {}) => {
      if (busy.current) return null;
      if (demo.current) {
        // The guide shows sample data: explain what would happen instead of sending anything.
        push({ kind: "demo", text: opts.expectFail ? `${label}: on-chain this is rejected by the program.` : `${label}: nothing was sent. Do it for real after the guide.` });
        return null;
      }
      busy.current = true;
      setPending(label);
      push({ kind: "info", text: label });
      try {
        const r = await fn();
        if (!r.failed) push({ kind: "ok", text: label, sig: r.signature });
        else if (opts.expectFail) push({ kind: "blocked", text: r.reason ?? label, sig: r.signature });
        else push({ kind: "err", text: `${label}: ${r.reason}`, sig: r.signature });
        return r;
      } catch (e) {
        console.error(e);
        const msg = errorMessage(e);
        push({ kind: "err", text: /reject|cancel/i.test(msg) ? `${label}: cancelled in wallet` : `${label}: ${msg}` });
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
    isTeamRoute(route) ? (
      <Team creating={route[1] === "new"} />
    ) : route[0] === "shift" && route[1] ? (
      <ShiftView address={route[1]} />
    ) : route[0] === "tip" && route[1] ? (
      <TipPage address={route[1]} />
    ) : (
      <Overview />
    );

  return (
    <Tx.Provider value={{ run, pending, tick }}>
     <HelpCtx.Provider value={tour.start}>
     <DemoMode.Provider value={tour.open && route[0] !== "tip"}>
     <TeamProvider tick={tick}>
      {tour.open && route[0] !== "tip" && (
        <>
          <Tour onClose={endTour} />
          <div className="demo-ribbon">
            <Icon name="compass" size={13} /> Guide demo · sample data · nothing is sent
          </div>
        </>
      )}
      {route[0] === "tip" ? (
        <div className="guest-shell">{page}</div>
      ) : (
        <div className={`app ${menuOpen ? "menu-open" : ""}`}>
          <Chrome route={route} onMenu={() => setMenuOpen((o) => !o)}>
            <div className="scrim" onClick={() => setMenuOpen(false)} />
            <main className="content">{page}</main>
          </Chrome>
        </div>
      )}

      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="toast-icon">
              {t.kind === "info" ? (
                <Spinner />
              ) : (
                <Icon name={t.kind === "ok" ? "check" : t.kind === "blocked" ? "shield" : t.kind === "demo" ? "compass" : "alert"} size={15} />
              )}
            </span>
            <div className="toast-body">
              <div className="toast-title">{TOAST_TITLE[t.kind]}</div>
              <div className="toast-text">{t.text}</div>
            </div>
            {t.sig && (
              <a className="btn tiny" href={explorerTx(t.sig)} target="_blank" rel="noreferrer">
                Explorer
              </a>
            )}
          </div>
        ))}
      </div>
     </TeamProvider>
     </DemoMode.Provider>
     </HelpCtx.Provider>
    </Tx.Provider>
  );
}

/** Old links (#/venue) still land on the team page. */
const isTeamRoute = (route: string[]) => route[0] === "team" || route[0] === "venue" || route[0] === "owner";

type Browsed = TeamData;

/** The team the chrome describes: the open shift's team, else yours. Fetched once for top bar and menu. */
function Chrome({ route, onMenu, children }: { route: string[]; onMenu: () => void; children: React.ReactNode }) {
  const { tick } = useTx();
  const mine = useMyTeam();
  const shiftTeam = useShiftTeam(route[0] === "shift" ? parseKey(route[1] ?? "") : null);
  const other = route[0] === "shift" && shiftTeam && !(mine.key && shiftTeam.equals(mine.key)) ? shiftTeam : null;
  const otherData = useTeamData(other, tick, 20000);
  const browsed = other ? otherData : mine;
  const section = isTeamRoute(route) || route[0] === "shift" ? "team" : "home";
  return (
    <>
      <Rail section={section} />
      <div className="main-col">
        <TopBar route={route} onMenu={onMenu} browsed={browsed} />
        <div className="workspace">
          {section === "team" && <SubMenu route={route} browsed={browsed} />}
          {children}
        </div>
      </div>
    </>
  );
}

/** Narrow icon rail; expands over the page on hover to show labels. */
function Rail({ section }: { section: "home" | "team" }) {
  return (
    <nav className="rail" aria-label="Main">
      <a className="rail-logo" href="#/" aria-label="Jar">
        <img className="logo-img" src="/icons/jar.png" alt="" />
        <span className="rail-label logo-word">Jar</span>
      </a>
      <a className={`rail-item ${section === "home" ? "on" : ""}`} href="#/">
        <Icon name="home" size={18} />
        <span className="rail-label">Overview</span>
      </a>
      <a className={`rail-item ${section === "team" ? "on" : ""}`} href="#/team" data-tour="nav-team">
        <Icon name="users" size={18} />
        <span className="rail-label">Team & shifts</span>
      </a>
      <div className="rail-spacer" />
      <a className="rail-item" href={explorerAddr(PROGRAM_ID)} target="_blank" rel="noreferrer">
        <Icon name="terminal" size={18} />
        <span className="rail-label">Program on Explorer</span>
      </a>
    </nav>
  );
}

function TopBar({ route, onMenu, browsed }: { route: string[]; onMenu: () => void; browsed: Browsed }) {
  const { team, shifts } = browsed;
  const shift = route[0] === "shift" ? shifts.find((s) => s.key.toBase58() === route[1]) : undefined;
  const crumbs: { label: string; href?: string }[] = [{ label: "Jar", href: "#/" }];
  if (isTeamRoute(route) || route[0] === "shift") crumbs.push({ label: team?.name ?? "Team", href: "#/team" });
  if (route[0] === "shift") crumbs.push({ label: shift ? shift.acc.label || `Shift ${shift.acc.index.toNumber() + 1}` : "Shift" });
  if (isTeamRoute(route) && route[1] === "new") crumbs.push({ label: "New shift" });

  return (
    <header className="topbar">
      <button className="icon-btn mobile-only" onClick={onMenu} aria-label="Menu">
        <Icon name="menu" size={18} />
      </button>
      <nav className="crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} className="crumb">
            {i > 0 && <span className="crumb-sep">/</span>}
            {c.href && i < crumbs.length - 1 ? <a href={c.href}>{c.label}</a> : <span className="crumb-here">{c.label}</span>}
          </span>
        ))}
        <span className="badge tone-gray net-badge">devnet</span>
      </nav>
      <div className="topbar-right">
        <HelpButton />
        <SignerMenu />
        <WalletMultiButton />
      </div>
    </header>
  );
}

function HelpButton() {
  const show = useContext(HelpCtx);
  return (
    <button className="btn help-btn" onClick={show} title="Guided tour: shows what to click">
      <Icon name="compass" size={14} />
      <span>Guide</span>
    </button>
  );
}

/** Secondary menu for the team section: the team plus the list of shifts. */
function SubMenu({ route, browsed }: { route: string[]; browsed: Browsed }) {
  const now = useChainNow();
  const { team, shifts } = browsed;
  const here = route.join("/");
  return (
    <aside className="submenu">
      <div className="submenu-title">{team?.name ?? "Team"}</div>
      <div className="submenu-group">
        <a className={`submenu-item ${isTeamRoute(route) && route.length === 1 ? "on" : ""}`} href="#/team">
          <Icon name="users" size={14} /> Team
        </a>
      </div>
      <div className="submenu-group grow">
        <div className="submenu-heading">
          Shifts
          {team && (
            <a className="icon-btn small" href="#/team/new" aria-label="New shift" title="New shift">
              <Icon name="plus" size={14} />
            </a>
          )}
        </div>
        {shifts.length === 0 && <div className="submenu-empty">{team ? "No shifts yet" : "Start a team first"}</div>}
        {shifts.slice(0, 12).map(({ key, acc }) => {
          const st = statusOf(acc, now);
          return (
            <a key={key.toBase58()} className={`submenu-item ${here === `shift/${key.toBase58()}` ? "on" : ""}`} href={`#/shift/${key.toBase58()}`}>
              <span className={`dot tone-${st.tone}`} title={st.label} />
              <span className="truncate">{acc.label || `Shift ${acc.index.toNumber() + 1}`}</span>
              <span className="submenu-meta">#{acc.index.toNumber() + 1}</span>
            </a>
          );
        })}
      </div>
    </aside>
  );
}

/** Who signs the next transaction. */
export function SignerMenu({ only, up }: { only?: ActorId[]; up?: boolean }) {
  const { visible: actors, active, setActive } = useActors();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const list = only ? actors.filter((a) => only.includes(a.id)) : actors;

  return (
    <div className="signer" ref={ref} data-tour="signer">
      <button className="signer-btn" onClick={() => setOpen((o) => !o)} title="Who signs the next transaction">
        <Avatar name={active.name} size={20} />
        <span className="signer-name">{active.name}</span>
        <span className="signer-role">{active.role}</span>
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div className={`menu ${up ? "up" : ""}`}>
          <div className="menu-label">Act as</div>
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
              <Avatar name={a.name} size={22} />
              <span className="menu-text">
                <span className="menu-name">{a.name}</span>
                <span className="menu-sub">{a.publicKey ? `${a.role} · ${short(a.publicKey)}` : "Connect a wallet first"}</span>
              </span>
              {a.id === active.id && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
