import { useContext, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useActors } from "../actors";
import { HelpCtx, useTx } from "../App";
import { ART } from "../art";
import { useInterval } from "../hooks";
import { PROGRAM_ID, balancesOf, explorerAddr, fromUnits, short } from "../solana";
import { Avatar, CopyButton, ExtLink, Icon, Panel } from "../ui";

const STEPS: { art: keyof typeof ART; title: string; text: string }[] = [
  { art: "store", title: "Owner opens a shift", text: "Creates the vault" },
  { art: "phone", title: "Guests tip by QR", text: "Straight into the vault" },
  { art: "clock", title: "Staff log hours", text: "Most of them agree" },
  { art: "split", title: "Anyone pays out", text: "Split by hours" },
];

export default function Overview() {
  const startTour = useContext(HelpCtx);
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-text">
          <span className="badge tone-green">Live on Solana devnet</span>
          <h1 className="hero-title">Tips the owner can't touch.</h1>
          <p className="hero-desc">Guests tip into a vault only code controls. Staff get paid by their hours.</p>
          <div className="row gap">
            <a className="btn primary" href="#/venue">
              Go to venue <Icon name="arrowRight" size={14} />
            </a>
            <button className="btn" onClick={startTour}>
              <Icon name="compass" size={14} /> Guide me
            </button>
          </div>
        </div>
        <img className="hero-art" src={ART.jar} alt="A locked tip jar" />
      </section>

      <div className="flow">
        {STEPS.map((s, i) => (
          <div className="flow-step" key={s.title}>
            <div className="card">
              <span className="card-step">0{i + 1}</span>
              <img className="card-art" src={ART[s.art]} alt="" />
              <h3 className="card-title">{s.title}</h3>
              <p className="card-text">{s.text}</p>
            </div>
            {i < STEPS.length - 1 && (
              <span className="flow-arrow" aria-hidden="true">
                <Icon name="arrowRight" size={16} />
              </span>
            )}
          </div>
        ))}
      </div>

      <DemoWallets />

      <div className="program-strip">
        <img src={ART.shield} alt="" />
        <span className="muted">Program</span>
        <span className="mono">{short(PROGRAM_ID, 8)}</span>
        <CopyButton text={PROGRAM_ID.toBase58()} />
        <ExtLink href={explorerAddr(PROGRAM_ID)}>Explorer</ExtLink>
        <span className="spacer" />
        <span className="chip">
          <Icon name="lock" size={12} /> No admin key
        </span>
        <span className="chip">
          <Icon name="x" size={12} /> No withdraw
        </span>
      </div>
    </div>
  );
}

function DemoWallets() {
  const { connection } = useConnection();
  const { actors, visible, fundCrew } = useActors();
  const { run, pending, tick } = useTx();
  const [bal, setBal] = useState<Record<string, { sol: number; usdc: bigint }>>({});

  useInterval(
    async () => {
      const known = actors.filter((a) => a.publicKey);
      const res = await balancesOf(connection, known.map((a) => a.publicKey!));
      setBal(Object.fromEntries(known.map((a, i) => [a.id, res[i]])));
    },
    20000,
    [actors.map((a) => a.publicKey?.toBase58()).join(), tick],
  );

  const wallet = actors[0];
  const lowCrew = actors.slice(1).some((a) => bal[a.id] && bal[a.id].sol < 0.01);

  return (
    <Panel
      title={
        <span className="title-art">
          <img src={ART.wallets} alt="" /> Who's who
        </span>
      }
      description="Owner, staff and a guest, all on this laptop. Shift pages show a button for each of them."
      actions={
        <button
          data-tour="fund"
          className={`btn ${lowCrew ? "primary" : ""}`}
          disabled={!wallet.publicKey || !!pending}
          title={wallet.publicKey ? "Tops up low wallets and gives the guest test USDC" : "Connect a wallet first"}
          onClick={() => run("Fund demo wallets", async () => ({ signature: await fundCrew(), failed: false }))}
        >
          <Icon name="coins" size={14} /> Fund
        </button>
      }
      flush
    >
      <div className="people">
        {visible.map((a) => (
          <div className="person" key={a.id}>
            <Avatar name={a.name} size={30} />
            <div className="person-text">
              <div className="person-name">{a.name}</div>
              <div className="person-role">{a.role}</div>
            </div>
            <div className="person-bal">
              {a.publicKey ? (
                <>
                  <span className="mono">{bal[a.id] ? fromUnits(bal[a.id].usdc) : "—"}</span>
                  <small>USDC</small>
                </>
              ) : (
                <span className="muted small">not connected</span>
              )}
            </div>
            {a.publicKey && (
              <a className="icon-btn small" href={explorerAddr(a.publicKey)} target="_blank" rel="noreferrer" title={a.publicKey.toBase58()}>
                <Icon name="external" size={12} />
              </a>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
