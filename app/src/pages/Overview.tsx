import { useContext, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useActors } from "../actors";
import { HelpCtx, useTx } from "../App";
import { ART } from "../Onboarding";
import { useInterval } from "../hooks";
import { PROGRAM_ID, TIP_MINT, balancesOf, explorerAddr, fromUnits, short } from "../solana";
import { Avatar, CopyButton, ExtLink, Icon, Panel, Prop, Properties } from "../ui";

const STEPS = [
  { art: "store", title: "Owner opens a shift", text: "Lists who's working. This creates the vault, and it's the last thing the owner controls." },
  { art: "phone", title: "Guests tip by QR", text: "Money goes from the guest's wallet straight into the vault. No account, no app." },
  { art: "clock", title: "Staff enter their hours", text: "Each person sets their own hours and agrees to everyone's. Any change resets agreement." },
  { art: "split", title: "Anyone pays out", text: "Majority agreed: split by hours. Nobody agreed in time: split equally." },
];

export default function Overview() {
  const showTour = useContext(HelpCtx);
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-text">
          <span className="badge tone-green">Live on Solana devnet</span>
          <h1 className="hero-title">Tips the owner can't touch.</h1>
          <p className="hero-desc">
            Guests tip by QR into a vault owned by a Solana program, not the restaurant. Staff confirm their own hours, and the program
            pays everyone their share. There's no withdraw button for the owner, because there's no withdraw instruction at all.
          </p>
          <div className="row gap">
            <a className="btn primary" href="#/venue">
              Go to venue <Icon name="chevronRight" size={14} />
            </a>
            <button className="btn" onClick={showTour}>
              <Icon name="info" size={14} /> How it works
            </button>
          </div>
        </div>
        <img className="hero-art" src={ART.jar} alt="A locked tip jar" />
      </section>

      <div className="cards4">
        {STEPS.map((s, i) => (
          <div className="card" key={s.title}>
            <div className="card-top">
              <img className="card-art" src={ART[s.art]} alt="" />
              <span className="card-step">0{i + 1}</span>
            </div>
            <h3 className="card-title">{s.title}</h3>
            <p className="card-text">{s.text}</p>
          </div>
        ))}
      </div>

      <DemoWallets />

      <Panel
        title={
          <span className="title-art">
            <img src={ART.shield} alt="" /> Program
          </span>
        }
        description="Every rule above is enforced here. No admin key, no server."
      >
        <Properties>
          <Prop label="Program ID">
            <span className="mono">{PROGRAM_ID.toBase58()}</span>
            <CopyButton text={PROGRAM_ID.toBase58()} />
            <ExtLink href={explorerAddr(PROGRAM_ID)}>Explorer</ExtLink>
          </Prop>
          <Prop label="Network">Solana devnet</Prop>
          <Prop label="Tip token">
            <span className="mono">{short(TIP_MINT, 6)}</span>
            <span className="muted">test USDC with a public faucet</span>
          </Prop>
        </Properties>
      </Panel>
    </div>
  );
}

function DemoWallets() {
  const { connection } = useConnection();
  const { actors, fundCrew } = useActors();
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
          <img src={ART.wallets} alt="" /> Demo wallets
        </span>
      }
      description="One laptop plays every role. Your connected wallet is the owner; the rest live in this browser. Choose who signs from the menu in the top bar."
      flush
      footer={
        <>
          <span className="muted small">
            {wallet.publicKey ? "Tops up any wallet under 0.01 SOL and sends the guest 200 test USDC." : "Connect a wallet first."}
          </span>
          <button
            className={`btn ${lowCrew ? "primary" : ""}`}
            disabled={!wallet.publicKey || !!pending}
            onClick={() => run("Fund demo wallets", async () => ({ signature: await fundCrew(), failed: false }))}
          >
            Fund demo wallets
          </button>
        </>
      }
    >
      <table className="grid">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Address</th>
            <th className="num">SOL</th>
            <th className="num">USDC</th>
          </tr>
        </thead>
        <tbody>
          {actors.map((a) => (
            <tr key={a.id}>
              <td>
                <span className="cell-person">
                  <Avatar name={a.name} />
                  {a.name}
                </span>
              </td>
              <td className="muted">{a.role}</td>
              <td className="mono">
                {a.publicKey ? <ExtLink href={explorerAddr(a.publicKey)}>{short(a.publicKey)}</ExtLink> : <span className="muted">Not connected</span>}
              </td>
              <td className="num mono">{bal[a.id] ? bal[a.id].sol.toFixed(3) : "—"}</td>
              <td className="num mono">{bal[a.id] ? fromUnits(bal[a.id].usdc) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
