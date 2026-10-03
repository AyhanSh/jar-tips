import { useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useActors } from "../actors";
import { useTx } from "../App";
import { useInterval } from "../hooks";
import { PROGRAM_ID, TIP_MINT, balancesOf, explorerAddr, fromUnits, short } from "../solana";
import { Avatar, CopyButton, ExtLink, Icon, PageHeader, Panel, Prop, Properties } from "../ui";

const STEPS = [
  { icon: "store", title: "Owner opens a shift", text: "Lists who's working. This creates the vault, and it's the last thing the owner controls." },
  { icon: "qr", title: "Guests tip by QR", text: "Money goes from the guest's wallet straight into the vault. No account, no app." },
  { icon: "clock", title: "Staff enter their hours", text: "Each person sets their own hours and agrees to everyone's. Any change resets agreement." },
  { icon: "coins", title: "Anyone pays out", text: "Majority agreed: split by hours. Nobody agreed in time: split equally." },
];

export default function Overview() {
  return (
    <div className="page">
      <PageHeader
        title="Overview"
        description="A tip jar for restaurant staff that the owner can't open. Tips sit in a vault owned by a Solana program, and only the team can be paid from it."
        actions={
          <a className="btn primary" href="#/venue">
            Go to venue <Icon name="chevronRight" size={14} />
          </a>
        }
      />

      <div className="cards4">
        {STEPS.map((s, i) => (
          <div className="card" key={s.title}>
            <div className="card-top">
              <span className="card-icon">
                <Icon name={s.icon} size={16} />
              </span>
              <span className="card-step">Step {i + 1}</span>
            </div>
            <h3 className="card-title">{s.title}</h3>
            <p className="card-text">{s.text}</p>
          </div>
        ))}
      </div>

      <DemoWallets />

      <Panel title="Program" description="Every rule above is enforced here. No admin key, no server.">
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
      title="Demo wallets"
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
