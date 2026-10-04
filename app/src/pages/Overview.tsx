import { useContext, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useActors } from "../actors";
import { HelpCtx, useTx } from "../App";
import { ART } from "../art";
import { useInterval } from "../hooks";
import { PROGRAM_ID, balancesOf, explorerAddr, short } from "../solana";
import { Avatar, CopyButton, ExtLink, Icon, SolanaMark } from "../ui";
import { JOURNEY, RoleTag } from "../journey";

/** Two blocks: what it is (with the whole flow in one line), and how to try it. */
export default function Overview() {
  const startTour = useContext(HelpCtx);
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-text">
          <span className="badge tone-green">
            <SolanaMark size={10} /> Live on Solana devnet
          </span>
          <h1 className="hero-title">Tips go straight to the team.</h1>
          <p className="hero-desc">No owner, no middleman. Guests tip into a vault only code controls, and the staff split it by hours.</p>
          <div className="row gap">
            <a className="btn primary" href="#/team">
              Start a team jar <Icon name="arrowRight" size={14} />
            </a>
            <button className="btn" onClick={startTour}>
              <Icon name="compass" size={14} /> Guide me
            </button>
          </div>
        </div>
        <img className="hero-art" src={ART.jar} alt="A locked tip jar" />
        <ol className="hero-flow" aria-label="How Jar works">
          {JOURNEY.map((j, i) => (
            <li key={j.title}>
              <img src={ART[j.art]} alt="" />
              <div>
                <b>
                  <span className="hero-flow-n">{i + 1}</span> {j.title}
                </b>
                <RoleTag role={j.role} />
              </div>
              {i < JOURNEY.length - 1 && <Icon name="chevronRight" size={14} className="hero-flow-sep" />}
            </li>
          ))}
        </ol>
      </section>

      <section className="panel try-panel">
        <div className="try-row">
          <div className="try-item">
            <span className="try-n">1</span>
            <img src={ART.clock} alt="" />
            <div className="try-text">
              <b>Watch the guide</b>
              <span>60 seconds, sample data</span>
            </div>
            <button className="btn" onClick={startTour}>
              <Icon name="compass" size={14} /> Guide me
            </button>
          </div>
          <div className="try-item">
            <span className="try-n">2</span>
            <img src={ART.wallets} alt="" />
            <div className="try-text">
              <b>Free demo money</b>
              <DemoFaces />
            </div>
            <FundButton />
          </div>
          <div className="try-item">
            <span className="try-n">3</span>
            <img src={ART.team} alt="" />
            <div className="try-text">
              <b>Run a real shift</b>
              <span>No wallet needed</span>
            </div>
            <a className="btn primary" href="#/team">
              Start <Icon name="arrowRight" size={14} />
            </a>
          </div>
        </div>
        <div className="try-foot">
          <img src={ART.shield} alt="" />
          <span className="muted">Program</span>
          <ExtLink href={explorerAddr(PROGRAM_ID)}>
            <span className="mono">{short(PROGRAM_ID, 6)}</span>
          </ExtLink>
          <CopyButton text={PROGRAM_ID.toBase58()} />
          <span className="spacer" />
          <span className="chip">
            <Icon name="users" size={12} /> No owner
          </span>
          <span className="chip">
            <Icon name="lock" size={12} /> No admin key
          </span>
          <span className="chip">
            <Icon name="x" size={12} /> No withdraw
          </span>
        </div>
      </section>

      <WhySolana />
    </div>
  );
}

/** Why the jar is a Solana program and not a database: what the chain does that an operator can't be trusted with. */
const WHY: { icon: string; title: string; text: string }[] = [
  { icon: "lock", title: "Custody by code", text: "Each shift's tips sit in a vault owned by a Solana program address. No private key exists for it." },
  { icon: "shield", title: "Rules nobody can change", text: "The program is immutable: no admin key and no upgrades, not even by us." },
  { icon: "globe", title: "Public by default", text: "Every tip, vote and payout is a Solana transaction anyone can check on Explorer." },
  { icon: "coins", title: "Fast and cheap", text: "Confirmed in seconds, for a fraction of a cent per tip." },
];

function WhySolana() {
  return (
    <section className="panel why-panel">
      <div className="panel-head">
        <div>
          <div className="panel-title title-art">
            <SolanaMark size={16} /> Why it runs on Solana
          </div>
          <div className="panel-desc">A database needs an operator, and whoever runs it can move the money. On Solana, nobody can.</div>
        </div>
        <ExtLink href={explorerAddr(PROGRAM_ID)}>Program on Solana Explorer</ExtLink>
      </div>
      <div className="why-row">
        {WHY.map((w) => (
          <div className="why-item" key={w.title}>
            <span className="why-icon">
              <Icon name={w.icon} size={16} />
            </span>
            <b>{w.title}</b>
            <span>{w.text}</span>
          </div>
        ))}
      </div>
      <div className="try-foot">
        <span className="muted">Built with</span>
        {["Anchor (Rust)", "SPL Token · Token-2022", "Solana Wallet Adapter", "Test USDC on devnet"].map((t) => (
          <span className="chip" key={t}>
            {t}
          </span>
        ))}
      </div>
    </section>
  );
}

/** The demo people, as faces: Ana, Ben and Kasia (staff) and a guest. */
function DemoFaces() {
  const { actors } = useActors();
  const people = actors.filter((a) => ["ana", "ben", "kasia", "guest"].includes(a.id));
  return (
    <span className="try-faces" title={people.map((p) => `${p.name}: ${p.role}`).join("\n")}>
      <span className="faces">
        {people.map((p) => (
          <Avatar key={p.id} name={p.name} size={20} />
        ))}
      </span>
      for 4 demo people
    </span>
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
      const keys = actors.filter((a) => a.keypair && a.id !== "outsider").map((a) => a.publicKey!);
      const res = await balancesOf(connection, keys);
      setReady(res.every((r) => r.sol >= 0.004));
    },
    20000,
    [tick],
  );
  return ready ? (
    <span className="chip yes">
      <Icon name="check" size={12} /> Funded
    </span>
  ) : (
    <button className="btn primary" disabled={!!pending} onClick={() => run("Free demo money", async () => ({ signature: await fundCrew(), failed: false }))}>
      <Icon name="coins" size={14} /> Fund
    </button>
  );
}
