import { createContext, useCallback, useContext, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useHashRoute } from "./hooks";
import { useActors, type SendResult } from "./actors";
import { PROGRAM_ID, errorMessage, explorerAddr, explorerTx } from "./solana";
import Home from "./pages/Home";
import Owner from "./pages/Owner";
import ShiftView from "./pages/ShiftView";
import TipPage from "./pages/TipPage";

// ---------------------------------------------------------------------------
// toasts: every transaction gets an Explorer link, including rejected ones
// ---------------------------------------------------------------------------
interface Toast {
  id: number;
  kind: "ok" | "err" | "info" | "blocked";
  text: string;
  sig?: string;
}
type Run = (label: string, fn: () => Promise<SendResult>, opts?: { expectFail?: boolean }) => Promise<SendResult | null>;
const ToastCtx = createContext<{ push: (t: Omit<Toast, "id">) => void; run: Run; tick: number }>({
  push: () => {},
  run: async () => null,
  tick: 0,
});
export const useToast = () => useContext(ToastCtx);

export default function App() {
  const [route] = useHashRoute();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tick, setTick] = useState(0);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.kind === "info" ? 6000 : 14000);
  }, []);

  const run = useCallback<Run>(
    async (label, fn, opts = {}) => {
      push({ kind: "info", text: `${label}: signing…` });
      try {
        const r = await fn();
        if (!r.failed) push({ kind: "ok", text: `${label}: confirmed on-chain`, sig: r.signature });
        else if (opts.expectFail) push({ kind: "blocked", text: `Rejected by Solana: ${r.reason}`, sig: r.signature });
        else push({ kind: "err", text: `${label} failed: ${r.reason}`, sig: r.signature });
        setTick((n) => n + 1);
        return r;
      } catch (e) {
        console.error(e);
        push({ kind: "err", text: `${label} failed: ${errorMessage(e)}` });
        return null;
      }
    },
    [push],
  );

  const customer = route[0] === "tip";
  let page;
  if (route[0] === "owner") page = <Owner />;
  else if (route[0] === "shift" && route[1]) page = <ShiftView address={route[1]} />;
  else if (customer && route[1]) page = <TipPage address={route[1]} />;
  else page = <Home />;

  return (
    <ToastCtx.Provider value={{ push, run, tick }}>
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="logo">🫙</span> Napiwek
          <span className="net">devnet</span>
        </a>
        <nav>
          {!customer && <a href="#/owner">Owner</a>}
          <ActorSwitcher compact={customer} />
          <WalletMultiButton />
        </nav>
      </header>

      <main className={customer ? "customer" : ""}>{page}</main>

      <footer>
        Tip rules live in the program{" "}
        <a href={explorerAddr(PROGRAM_ID)} target="_blank" rel="noreferrer">
          {PROGRAM_ID.toBase58()}
        </a>{" "}
        on Solana devnet. It has no withdraw instruction and no admin key.
      </footer>

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <div>{t.text}</div>
            {t.sig && (
              <a href={explorerTx(t.sig)} target="_blank" rel="noreferrer">
                View on Solana Explorer ↗
              </a>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** "Acting as" pills: the browser wallet plus the demo crew. */
function ActorSwitcher({ compact }: { compact?: boolean }) {
  const { actors, active, setActive } = useActors();
  const shown = compact ? actors.filter((a) => a.id === "wallet" || a.id === "guest") : actors;
  return (
    <div className="actors" title="Who signs the next transaction">
      <span className="muted small">Acting as</span>
      {shown.map((a) => (
        <button
          key={a.id}
          className={`pill ${a.id === active.id ? "on" : ""}`}
          onClick={() => setActive(a.id)}
          disabled={!a.publicKey}
        >
          {a.emoji} {a.name}
        </button>
      ))}
    </div>
  );
}
