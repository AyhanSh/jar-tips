import { useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useActors } from "../actors";
import { useToast } from "../App";
import { useInterval } from "../hooks";
import { SYMBOL, balancesOf, explorerAddr, fromUnits, short } from "../solana";

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Tips that the owner can't touch.</h1>
        <p className="lead">
          Customers tip by QR into a vault that belongs to a Solana program, not to the restaurant. When the shift ends,
          staff confirm their own hours and the program pays everyone their share. There is no withdraw button for the
          owner, because there is no withdraw instruction at all.
        </p>
        <div className="row">
          <a className="btn primary" href="#/owner">Open the owner dashboard →</a>
          <a className="btn ghost" href="#how">How it works</a>
        </div>
      </section>

      <section className="steps" id="how">
        <Step n={1} title="Owner opens a shift" text="Names the shift and who is working. That's the last thing the owner controls." />
        <Step n={2} title="Guests tip by QR" text="Money goes from the guest's wallet straight into the shift vault. Its only key is the program." />
        <Step n={3} title="Staff confirm hours" text="Each person enters their own hours. Any change resets everyone's sign-off." />
        <Step n={4} title="Program pays out" text="Majority agrees → split by hours. Nobody agrees in time → split equally. Anyone can press the button." />
      </section>

      <DemoCrew />
    </>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="step">
      <div className="n">{n}</div>
      <h3>{title}</h3>
      <p className="muted">{text}</p>
    </div>
  );
}

function DemoCrew() {
  const { connection } = useConnection();
  const { actors, fundCrew } = useActors();
  const { run, tick } = useToast();
  const [bal, setBal] = useState<Record<string, { sol: number; usdc: bigint }>>({});

  useInterval(
    async () => {
      const known = actors.filter((a) => a.publicKey);
      const res = await balancesOf(connection, known.map((a) => a.publicKey!));
      setBal(Object.fromEntries(known.map((a, i) => [a.id, res[i]])));
    },
    20000,
    [actors, tick],
  );

  const wallet = actors[0];
  return (
    <section className="card">
      <div className="row between">
        <div>
          <h2>Demo crew</h2>
          <p className="muted">
            One laptop, every role. Your connected wallet is the <b>owner</b>. Ana, Ben, Kasia and a guest are devnet
            keypairs stored in this browser. Switch between them with “Acting as” in the top bar.
          </p>
        </div>
        <button
          className="btn primary"
          disabled={!wallet.publicKey}
          onClick={() => run("Fund demo crew", async () => ({ signature: await fundCrew(), failed: false }))}
          title="Sends 0.02 devnet SOL to each demo keypair and 200 test USDC to the guest"
        >
          Fund crew from my wallet
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Who</th>
            <th>Address</th>
            <th className="num">SOL</th>
            <th className="num">{SYMBOL}</th>
          </tr>
        </thead>
        <tbody>
          {actors.map((a) => (
            <tr key={a.id}>
              <td>
                {a.emoji} <b>{a.name}</b> <span className="muted">{a.role}</span>
              </td>
              <td className="mono">
                {a.publicKey ? (
                  <a href={explorerAddr(a.publicKey)} target="_blank" rel="noreferrer">
                    {short(a.publicKey, 6)}
                  </a>
                ) : (
                  <span className="muted">connect wallet</span>
                )}
              </td>
              <td className="num">{bal[a.id] ? bal[a.id].sol.toFixed(3) : "…"}</td>
              <td className="num">{bal[a.id] ? fromUnits(bal[a.id].usdc) : "…"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        {SYMBOL} here is a devnet test token with a public faucet. In production this would be real USDC (or EURC / a
        PLN stablecoin); the program accepts any SPL or Token-2022 mint chosen when the venue is created.
      </p>
    </section>
  );
}
