import { useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useActors } from "../actors";
import { useTx } from "../App";
import { useInterval } from "../hooks";
import { PROGRAM_ID, balancesOf, explorerAddr, fromUnits, short } from "../solana";
import { Avatar, Callout, ExtLink, Icon } from "../ui";

export default function Overview() {
  return (
    <article className="doc">
      <h1 className="title">Napiwek</h1>
      <p className="lede">A tip jar for restaurant staff that the owner can't open.</p>

      <p>
        Guests tip by QR into a vault that belongs to a Solana program, not to the restaurant. When the shift ends, each person
        enters the hours they worked, and once more than half of the team agrees, anyone can pay everyone out. The owner has no
        way to withdraw: the program simply has no instruction for it.
      </p>

      <h2>How a shift works</h2>
      <ol className="steps">
        <li>
          <b>The owner opens a shift</b> and lists who's working. This creates the vault. It's the last thing the owner controls.
        </li>
        <li>
          <b>Guests tip by QR.</b> The money goes from their wallet straight into the vault.
        </li>
        <li>
          <b>Staff enter their own hours</b> and confirm everyone's. If anyone changes a number, all confirmations reset.
        </li>
        <li>
          <b>Anyone pays out.</b> With a majority, the pot is split by hours. If nobody agrees in time, it's split equally.
        </li>
      </ol>

      <DemoWallets />

      <h2>Rules live on-chain</h2>
      <p className="muted">
        Every rule above is enforced by the program <ExtLink href={explorerAddr(PROGRAM_ID)}>{short(PROGRAM_ID, 6)}</ExtLink> on
        Solana devnet. There is no admin key and no server.
      </p>

      <div className="row gap">
        <a className="btn primary" href="#/venue">
          Go to your venue <Icon name="chevronRight" size={14} />
        </a>
      </div>
    </article>
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
    <>
      <h2>Demo wallets</h2>
      <Callout>
        One laptop plays every role. Your connected wallet is the owner. The other five are devnet wallets stored in this browser.
        Pick who signs from <b>Signing as</b> in the sidebar.
      </Callout>
      <table className="db">
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
                  <Avatar name={a.name} seed={a.id} />
                  {a.name}
                </span>
              </td>
              <td className="muted">{a.role}</td>
              <td className="mono">
                {a.publicKey ? <ExtLink href={explorerAddr(a.publicKey)}>{short(a.publicKey)}</ExtLink> : <span className="muted">Not connected</span>}
              </td>
              <td className="num">{bal[a.id] ? bal[a.id].sol.toFixed(3) : "—"}</td>
              <td className="num">{bal[a.id] ? fromUnits(bal[a.id].usdc) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row gap">
        <button
          className={`btn ${lowCrew ? "primary" : ""}`}
          disabled={!wallet.publicKey || !!pending}
          onClick={() => run("Fund demo wallets", async () => ({ signature: await fundCrew(), failed: false }))}
        >
          Fund demo wallets
        </button>
        <span className="muted small">
          {wallet.publicKey ? "Sends 0.02 SOL to each demo wallet that's low, and 200 test USDC to the guest." : "Connect a wallet in the sidebar first."}
        </span>
      </div>
    </>
  );
}
