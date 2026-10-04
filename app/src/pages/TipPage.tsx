import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useActors } from "../actors";
import { SignerMenu, useTx } from "../App";
import { useShift } from "../data";
import { useInterval, useProgram } from "../hooks";
import { ata, explorerTx, faucetIxs, fromUnits, isMobile, ixTip, parseKey, tipUrl, toUnits, tokenBalance, txOf, walletBrowseLinks } from "../solana";
import { Avatar, Icon, SolanaMark } from "../ui";
import { ART } from "../art";

const PRESETS = [5, 10, 20];

export default function TipPage({ address }: { address: string }) {
  const key = useMemo(() => parseKey(address), [address]);
  const program = useProgram();
  const { connection } = useConnection();
  const { active, actors, setActive, send } = useActors();
  const { run, pending, tick } = useTx();
  const { shift, team } = useShift(key, tick);
  const [amount, setAmount] = useState(10);
  const [custom, setCustom] = useState("");
  const [bal, setBal] = useState<bigint | null>(null);
  const [done, setDone] = useState<{ sig: string; amount: number } | null>(null);
  const [sol, setSol] = useState<number | null>(null);
  const { wallets } = useWallet();
  const phone = useMemo(isMobile, []);
  const walletInstalled = wallets.some((w) => w.readyState === "Installed");

  // On a phone the guest pays with their own wallet. On the demo laptop without a wallet, the demo guest pays.
  useEffect(() => {
    if (phone) {
      if (active.id !== "wallet") setActive("wallet");
    } else if (!actors[0].publicKey && active.id === "wallet") setActive("guest");
  }, [phone, actors, active.id, setActive]);

  useInterval(
    async () => {
      if (!active.publicKey) return;
      setBal(await tokenBalance(connection, ata(active.publicKey)));
      setSol((await connection.getBalance(active.publicKey)) / 1e9);
    },
    10000,
    [active.publicKey?.toBase58(), tick],
  );

  if (!key) return <TipCard><p className="muted">This QR code doesn't point to a valid shift.</p></TipCard>;
  if (shift === undefined)
    return (
      <TipCard>
        <div className="skeleton title-skel" />
        <div className="skeleton" />
      </TipCard>
    );
  if (shift === null) return <TipCard><p className="muted">This shift doesn't exist.</p></TipCard>;

  const value = custom ? Number(custom) : amount;
  const units = toUnits(value || 0);
  const enough = bal !== null && bal >= BigInt(units.toString());
  const names = shift.staff.map((s) => s.name);

  if (shift.settled)
    return (
      <TipCard venue={team?.name}>
        <h1>This shift is closed</h1>
        <p className="muted">Already paid out to the team.</p>
      </TipCard>
    );

  if (done)
    return (
      <TipCard venue={team?.name}>
        <img className="tip-art" src={ART.team} alt="" />
        <h1>Thank you</h1>
        <p>
          {done.amount} USDC is in the team's pot, shared by hours.
        </p>
        <div className="tip-actions">
          <a className="btn" href={explorerTx(done.sig)} target="_blank" rel="noreferrer">
            Receipt <Icon name="external" size={12} />
          </a>
          <button className="btn ghost" onClick={() => setDone(null)}>
            Tip again
          </button>
        </div>
      </TipCard>
    );

  return (
    <TipCard venue={team?.name}>
      <img className="tip-art" src={ART.jar} alt="" />
      <h1>Leave a tip for the team</h1>
      <div className="team-faces">
        <span className="faces">
          {shift.staff.slice(0, 5).map((s) => (
            <Avatar key={s.wallet.toBase58()} name={s.name} seed={s.wallet.toBase58()} size={28} />
          ))}
        </span>
        <span className="muted">
          {shift.label ? `${shift.label} · ` : ""}
          {listNames(names)}
        </span>
      </div>

      <div className="amounts" role="radiogroup" aria-label="Tip amount">
        {PRESETS.map((p) => (
          <button
            key={p}
            role="radio"
            aria-checked={!custom && amount === p}
            className={`amount ${!custom && amount === p ? "on" : ""}`}
            onClick={() => {
              setAmount(p);
              setCustom("");
            }}
          >
            {p}
          </button>
        ))}
        <input
          className={`amount ${custom ? "on" : ""}`}
          placeholder="Other"
          inputMode="decimal"
          aria-label="Other amount"
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))}
        />
      </div>

      <button
        className="btn primary pay"
        disabled={!active.publicKey || !(value > 0) || !enough || !!pending}
        onClick={() =>
          run("Tip", async () => {
            const r = await send(txOf(await ixTip(program, active.publicKey!, key, units)));
            if (!r.failed) setDone({ sig: r.signature, amount: value });
            return r;
          })
        }
      >
        {pending === "Tip" ? "Sending…" : `Tip ${value > 0 ? value : ""} USDC`}
      </button>

      <p className="fine">
        <Icon name="lock" size={13} />
        Only the team can be paid from this pot.
      </p>

      <div className="tip-foot">
        {active.publicKey ? (
          <span className="muted small">
            Balance {bal === null ? "…" : fromUnits(bal)} USDC
            {bal !== null && !enough && sol !== null && sol >= 0.002 && (
              <>
                {" · "}
                <button
                  className="link-btn"
                  disabled={!!pending}
                  onClick={() =>
                    run("Get test USDC", async () => {
                      const { ixs, faucet } = faucetIxs(active.publicKey!, active.publicKey!, 50_000_000n);
                      return send(txOf(...ixs), { signers: [faucet] });
                    })
                  }
                >
                  get 50 test USDC
                </button>
              </>
            )}
          </span>
        ) : (
          <span className="muted small">{phone ? "Connect your wallet to tip" : "Connect a wallet to tip"}</span>
        )}

        {active.publicKey && sol !== null && sol < 0.002 && (
          <a className="hint-row" href="https://faucet.solana.com" target="_blank" rel="noreferrer">
            <Icon name="coins" size={13} /> This wallet needs a little devnet SOL for fees. Get some free
            <Icon name="external" size={11} />
          </a>
        )}

        {phone && !walletInstalled && !actors[0].publicKey && (
          <div className="open-in">
            <span className="muted small">Open this page in your wallet app:</span>
            <div className="row gap">
              <a className="btn primary" href={walletBrowseLinks(tipUrl(key)).phantom}>
                Open in Phantom
              </a>
              <a className="btn" href={walletBrowseLinks(tipUrl(key)).solflare}>
                Solflare
              </a>
            </div>
            <span className="muted small">Set the wallet to devnet (Settings → Developer settings).</span>
          </div>
        )}

        <div className="tip-who">
          {!phone && <SignerMenu only={["wallet", "guest"]} />}
          {!actors[0].publicKey && <WalletMultiButton />}
        </div>
      </div>
    </TipCard>
  );
}

function TipCard({ venue, children }: { venue?: string; children: React.ReactNode }) {
  return (
    <div className="tip-wrap">
      <div className="tip-venue">
        <span className="ws-mark">{(venue ?? "N")[0]}</span>
        {venue ?? "Jar"}
      </div>
      <div className="tip-card">{children}</div>
      <div className="tip-powered muted small">
        <SolanaMark size={11} /> Jar · built on Solana (devnet)
      </div>
    </div>
  );
}

function listNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
