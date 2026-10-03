import { useEffect, useMemo, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useActors } from "../actors";
import { useToast } from "../App";
import { useInterval, useProgram } from "../hooks";
import {
  ata,
  explorerTx,
  faucetIxs,
  fromUnits,
  ixTip,
  toUnits,
  tokenBalance,
  txOf,
  type ShiftAccount,
  type VenueAccount,
} from "../solana";

const PRESETS = [5, 10, 20];

export default function TipPage({ address }: { address: string }) {
  const key = useMemo(() => {
    try {
      return new PublicKey(address);
    } catch {
      return null;
    }
  }, [address]);
  const program = useProgram();
  const { connection } = useConnection();
  const { active, actors, setActive, send } = useActors();
  const { run, tick } = useToast();
  const [shift, setShift] = useState<ShiftAccount | null | undefined>(undefined);
  const [venue, setVenue] = useState<VenueAccount | null>(null);
  const [amount, setAmount] = useState(10);
  const [custom, setCustom] = useState("");
  const [bal, setBal] = useState<bigint | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Without a connected wallet, the demo guest is the natural customer.
  useEffect(() => {
    if (!actors[0].publicKey && active.id === "wallet") setActive("guest");
  }, [actors, active.id, setActive]);

  useInterval(
    async () => {
      if (!key) return;
      const s = await program.account.shift.fetchNullable(key);
      setShift(s);
      if (s && !venue) program.account.venue.fetchNullable(s.venue).then(setVenue);
    },
    10000,
    [key?.toBase58()],
  );
  useInterval(
    async () => {
      if (active.publicKey) setBal(await tokenBalance(connection, ata(active.publicKey)));
    },
    8000,
    [active.publicKey?.toBase58(), tick],
  );

  if (!key) return <div className="card narrow center">This QR code doesn't point to a valid shift.</div>;
  if (shift === undefined) return <div className="card narrow center muted">Loading…</div>;
  if (shift === null) return <div className="card narrow center">Shift not found.</div>;

  const value = custom ? Number(custom) : amount;
  const units = toUnits(value || 0);
  const enough = bal !== null && bal >= BigInt(units.toString());
  const names = shift.staff.map((s) => s.name);

  if (shift.settled)
    return (
      <div className="tip-card">
        <h1>This shift is closed</h1>
        <p className="muted">Its tips have already been paid out to the team. Ask your server for today's QR code.</p>
      </div>
    );

  if (done)
    return (
      <div className="tip-card thanks">
        <div className="emoji">🙏</div>
        <h1>Thank you!</h1>
        <p>
          Your tip is in the team's pot. It will be shared between <b>{listNames(names)}</b> by the hours they worked.
        </p>
        <p className="muted small">The restaurant can't withdraw it. This is enforced by code, not by a promise.</p>
        <a href={explorerTx(done)} target="_blank" rel="noreferrer" className="btn ghost small">
          See the receipt ↗
        </a>
        <button className="btn ghost small" onClick={() => setDone(null)}>
          Tip again
        </button>
      </div>
    );

  return (
    <div className="tip-card">
      <span className="eyebrow">{venue?.name ?? "…"}</span>
      <h1>Tip the team</h1>
      <p className="muted">
        {shift.label} · {listNames(names)}
      </p>

      <div className="amounts">
        {PRESETS.map((p) => (
          <button
            key={p}
            className={`amount ${!custom && amount === p ? "on" : ""}`}
            onClick={() => {
              setAmount(p);
              setCustom("");
            }}
          >
            {p} <small>USDC</small>
          </button>
        ))}
        <input
          className={`amount ${custom ? "on" : ""}`}
          placeholder="Other"
          inputMode="decimal"
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))}
        />
      </div>

      <button
        className="btn primary pay"
        disabled={!active.publicKey || !(value > 0) || !enough}
        onClick={() =>
          run("Tip", async () => {
            const r = await send(txOf(await ixTip(program, active.publicKey!, key, units)));
            if (!r.failed) setDone(r.signature);
            return r;
          })
        }
      >
        Tip {value > 0 ? value : ""} USDC
      </button>

      <div className="promise">
        <span>🔒</span>
        <span>
          100% goes to the people who served you. The money sits in a vault the owner has no key to, and is split by the hours each
          person confirms.
        </span>
      </div>

      <div className="wallet-line muted small">
        {active.publicKey ? (
          <>
            Paying as {active.emoji} {active.name} · balance {bal === null ? "…" : fromUnits(bal)} USDC
            {bal !== null && !enough && (
              <button
                className="btn ghost small"
                onClick={() =>
                  run("Get test USDC", async () => {
                    const { ixs, faucet } = faucetIxs(active.publicKey!, active.publicKey!, 50_000_000n);
                    return send(txOf(...ixs), { signers: [faucet] });
                  })
                }
              >
                + 50 test USDC
              </button>
            )}
          </>
        ) : (
          "Connect a wallet to tip"
        )}
      </div>
    </div>
  );
}

function listNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
