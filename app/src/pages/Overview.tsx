import { useContext, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useActors } from "../actors";
import { HelpCtx, useTx } from "../App";
import { ART } from "../art";
import { useInterval } from "../hooks";
import { PROGRAM_ID, balancesOf, explorerAddr, fromUnits, short } from "../solana";
import { Avatar, CopyButton, ExtLink, Icon, Panel } from "../ui";
import { Journey } from "../journey";


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

      <Journey current={0} />

      <section>
        <h2 className="section-title">Try it yourself</h2>
        <div className="try">
          <div className="try-step">
            <span className="try-n">1</span>
            <img src={ART.jar} alt="" />
            <b>Watch the guide</b>
            <span>60 seconds, sample data</span>
            <button className="btn" onClick={startTour}>
              <Icon name="compass" size={14} /> Guide me
            </button>
          </div>
          <div className="try-step">
            <span className="try-n">2</span>
            <img src={ART.wallets} alt="" />
            <b>Get free demo money</b>
            <span>Devnet SOL and test USDC</span>
            <FundButton />
          </div>
          <div className="try-step">
            <span className="try-n">3</span>
            <img src={ART.store} alt="" />
            <b>Run a real shift</b>
            <span>On Solana devnet</span>
            <a className="btn primary" href="#/venue">
              Go to venue <Icon name="arrowRight" size={14} />
            </a>
          </div>
        </div>
      </section>

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
          disabled={!!pending}
          title="Free devnet SOL for the demo people, and test USDC for the guest"
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

/** Funds the demo people; turns into a check mark once they're ready to play. */
function FundButton() {
  const { connection } = useConnection();
  const { actors, fundCrew } = useActors();
  const { run, pending, tick } = useTx();
  const [ready, setReady] = useState<boolean | null>(null);
  useInterval(
    async () => {
      const keys = actors.filter((a) => a.keypair).map((a) => a.publicKey!);
      const res = await balancesOf(connection, keys);
      setReady(res.every((r) => r.sol >= 0.004));
    },
    20000,
    [tick],
  );
  return ready ? (
    <span className="chip yes">
      <Icon name="check" size={12} /> Everyone is funded
    </span>
  ) : (
    <button className="btn primary" disabled={!!pending} onClick={() => run("Free demo money", async () => ({ signature: await fundCrew(), failed: false }))}>
      <Icon name="coins" size={14} /> Fund demo people
    </button>
  );
}
