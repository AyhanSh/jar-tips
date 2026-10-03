import { useEffect, useMemo, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import QRCode from "qrcode";
import { useActors, type Actor } from "../actors";
import { useToast } from "../App";
import { formatDuration, useChainNow, useInterval, useProgram } from "../hooks";
import {
  ata,
  confirmations,
  explorerAddr,
  explorerTx,
  fromUnits,
  hasMajority,
  ixAddStaff,
  ixConfirm,
  ixEndShift,
  ixOwnerRawWithdraw,
  ixSettle,
  ixSubmitHours,
  loadActivity,
  phaseOf,
  previewShares,
  short,
  tokenBalance,
  txOf,
  vaultOf,
  type Activity,
  type ShiftAccount,
  type VenueAccount,
} from "../solana";

export default function ShiftView({ address }: { address: string }) {
  const key = useMemo(() => {
    try {
      return new PublicKey(address);
    } catch {
      return null;
    }
  }, [address]);
  const program = useProgram();
  const { connection } = useConnection();
  const { tick } = useToast();
  const now = useChainNow();
  const [shift, setShift] = useState<ShiftAccount | null | undefined>(undefined);
  const [venue, setVenue] = useState<VenueAccount | null>(null);
  const [vaultBal, setVaultBal] = useState<bigint>(0n);
  const [activity, setActivity] = useState<Activity[]>([]);

  useInterval(
    async () => {
      if (!key) return;
      const s = await program.account.shift.fetchNullable(key);
      setShift(s);
      if (!s) return;
      if (!venue) program.account.venue.fetchNullable(s.venue).then(setVenue);
      if (!s.settled) setVaultBal(await tokenBalance(connection, vaultOf(key)));
    },
    5000,
    [key?.toBase58(), tick],
  );

  useInterval(
    async () => {
      if (!key) return;
      const a = await loadActivity(connection, key);
      const b = await loadActivity(connection, vaultOf(key));
      const seen = new Set<string>();
      setActivity(
        [...a, ...b]
          .filter((x) => (seen.has(x.signature) ? false : (seen.add(x.signature), true)))
          .sort((x, y) => (y.time ?? 0) - (x.time ?? 0)),
      );
    },
    20000,
    [key?.toBase58(), tick],
  );

  if (!key) return <div className="card narrow center">That isn't a valid shift address.</div>;
  if (shift === undefined) return <div className="card narrow center muted">Loading shift from devnet…</div>;
  if (shift === null) return <div className="card narrow center">Shift not found on devnet.</div>;

  const phase = phaseOf(shift, now);
  const pool = shift.settled ? BigInt(shift.paidOut.toString()) : vaultBal;
  const closesAt = shift.closesAt.toNumber();
  const fallbackAt = closesAt + shift.confirmWindow.toNumber();
  const majority = hasMajority(shift);
  const shares = shift.settled
    ? shift.staff.map((s) => BigInt(s.paid.toString()))
    : previewShares(shift, pool, !majority && phase === "fallback");

  return (
    <>
      <section className="card shift-head">
        <div>
          <span className="eyebrow">
            {venue?.name ?? "…"} · shift #{shift.index.toNumber() + 1}
          </span>
          <h1>{shift.label || "Shift"}</h1>
          <PhaseLine phase={phase} now={now} closesAt={closesAt} fallbackAt={fallbackAt} shift={shift} />
        </div>
        <div className="pool">
          <span className="muted small">{shift.settled ? "Paid out to staff" : "In the tip vault"}</span>
          <span className="big">{fromUnits(pool)} USDC</span>
          <span className="muted small">
            {shift.tipCount} tip{shift.tipCount === 1 ? "" : "s"} ·{" "}
            <a href={explorerAddr(vaultOf(key))} target="_blank" rel="noreferrer">
              vault {short(vaultOf(key))}
            </a>
          </span>
        </div>
      </section>

      <div className="grid-main">
        <div>
          <Roster shift={shift} shares={shares} phase={phase} majority={majority} />
          <Actions shiftKey={key} shift={shift} phase={phase} majority={majority} pool={pool} />
        </div>
        <div>
          {!shift.settled && <TipQr shiftKey={key} />}
          <OwnerCard shift={shift} />
          <ActivityFeed activity={activity} />
        </div>
      </div>
    </>
  );
}

function PhaseLine(props: { phase: string; now: number; closesAt: number; fallbackAt: number; shift: ShiftAccount }) {
  const { phase, now, closesAt, fallbackAt, shift } = props;
  if (phase === "open")
    return (
      <p className="phase open">
        ● Tipping open · shift ends in {formatDuration(closesAt - now)}
      </p>
    );
  if (phase === "confirming")
    return (
      <p className="phase confirming">
        ● Shift over · staff confirming hours · equal-split fallback in {formatDuration(fallbackAt - now)}
      </p>
    );
  if (phase === "fallback")
    return <p className="phase fallback">● Confirm window passed · anyone can pay out now</p>;
  return (
    <p className="phase settled">
      ✓ Paid out {new Date(shift.settledAt.toNumber() * 1000).toLocaleTimeString()}{" "}
      {shift.byTimeout ? "· equal split (no majority in time)" : "· split by confirmed hours"}
    </p>
  );
}

function Roster({ shift, shares, phase, majority }: { shift: ShiftAccount; shares: bigint[]; phase: string; majority: boolean }) {
  const { active, actorFor } = useActors();
  const needed = Math.floor(shift.staff.length / 2) + 1;
  const conf = confirmations(shift);
  return (
    <section className="card">
      <div className="row between">
        <h2>Staff & split</h2>
        <div className={`meter ${majority ? "ok" : ""}`}>
          {conf} of {shift.staff.length} confirmed · {needed} needed
          <div className="bar">
            <div style={{ width: `${Math.min(100, (conf / needed) * 100)}%` }} />
          </div>
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Hours</th>
            <th>Confirmed</th>
            <th className="num">{shift.settled ? "Paid" : phase === "open" ? "Share so far" : "Would get"}</th>
          </tr>
        </thead>
        <tbody>
          {shift.staff.map((s, i) => {
            const me = active.publicKey?.equals(s.wallet);
            const demo = actorFor(s.wallet);
            return (
              <tr key={s.wallet.toBase58()} className={me ? "me" : ""}>
                <td>
                  {demo?.emoji ?? "👤"} <b>{s.name}</b>{" "}
                  <a className="mono small" href={explorerAddr(s.wallet)} target="_blank" rel="noreferrer">
                    {short(s.wallet)}
                  </a>
                </td>
                <td>{s.submitted ? hm(s.minutes) : <span className="muted">not yet</span>}</td>
                <td>
                  {s.confirmedVersion === shift.version ? (
                    <span className="badge ok">✓ v{shift.version}</span>
                  ) : s.confirmedVersion > 0 ? (
                    <span className="badge warn" title="Hours changed after they confirmed">outdated</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="num">
                  <b>{fromUnits(shares[i] ?? 0n)}</b>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!shift.settled && (
        <p className="muted small">
          Preview uses the program's own rule: {majority || phase !== "fallback" ? "pro-rata by submitted minutes" : "equal split"}
          , rounding dust to the longest shift. Version {shift.version}: every hours change bumps it and voids old confirmations.
        </p>
      )}
    </section>
  );
}

function Actions(props: { shiftKey: PublicKey; shift: ShiftAccount; phase: string; majority: boolean; pool: bigint }) {
  const { shiftKey, shift, phase, majority, pool } = props;
  const { active } = useActors();
  const entry = shift.staff.find((s) => active.publicKey && s.wallet.equals(active.publicKey));
  const isOwner = !!active.publicKey?.equals(shift.owner);

  if (shift.settled)
    return (
      <section className="card done">
        <h2>Done. The owner never held these tips.</h2>
        <p className="muted">
          The vault was emptied into each person's own wallet in one transaction and then closed, so no late tip can get stuck.
        </p>
      </section>
    );

  return (
    <>
      {entry && <StaffPanel shiftKey={shiftKey} shift={shift} phase={phase} me={active} />}
      {isOwner && <OwnerPanel shiftKey={shiftKey} shift={shift} phase={phase} pool={pool} />}
      {!entry && !isOwner && (
        <section className="card muted small">
          {active.name} is not on this roster: they can tip and trigger the payout, nothing else. Switch “Acting as” to Ana, Ben or
          Kasia to act as staff.
        </section>
      )}
      <SettlePanel shiftKey={shiftKey} shift={shift} phase={phase} majority={majority} />
    </>
  );
}

function StaffPanel({ shiftKey, shift, phase, me }: { shiftKey: PublicKey; shift: ShiftAccount; phase: string; me: Actor }) {
  const program = useProgram();
  const { send } = useActors();
  const { run } = useToast();
  const entry = shift.staff.find((s) => s.wallet.equals(me.publicKey!))!;
  const [hours, setHours] = useState(entry.submitted ? entry.minutes / 60 : shift.scheduledMinutes / 60);
  useEffect(() => setHours(entry.submitted ? entry.minutes / 60 : shift.scheduledMinutes / 60), [me.id]); // eslint-disable-line

  const confirmed = entry.confirmedVersion === shift.version;
  return (
    <section className="card staff-panel">
      <h2>
        {me.emoji} {entry.name}, your part
      </h2>
      <div className="row">
        <label className="inline">
          Hours I worked
          <input
            type="number"
            min={0}
            max={shift.scheduledMinutes / 60}
            step={0.25}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          />
        </label>
        <button
          className="btn"
          onClick={() =>
            run("Submit hours", async () =>
              send(txOf(await ixSubmitHours(program, me.publicKey!, shiftKey, Math.round(hours * 60)))),
            )
          }
        >
          {entry.submitted ? "Update my hours" : "Submit my hours"}
        </button>
        <span className="muted small">max {hm(shift.scheduledMinutes)}</span>
      </div>
      <div className="row">
        <button
          className="btn primary"
          disabled={phase === "open" || confirmed}
          onClick={() =>
            run("Confirm hours", async () => send(txOf(await ixConfirm(program, me.publicKey!, shiftKey, shift.version))))
          }
        >
          {confirmed ? "✓ You confirmed this version" : `I agree with everyone's hours (v${shift.version})`}
        </button>
        {phase === "open" && <span className="muted small">You can confirm once the shift is over.</span>}
      </div>
    </section>
  );
}

function OwnerPanel({ shiftKey, shift, phase, pool }: { shiftKey: PublicKey; shift: ShiftAccount; phase: string; pool: bigint }) {
  const program = useProgram();
  const { send, active } = useActors();
  const { run } = useToast();
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const owner = active.publicKey!;
  // Ask for exactly what's in the vault: the Token program checks the balance before the authority.
  const amount = pool;

  const rawWithdraw = () =>
    run("Withdraw tips to owner", async () => send(txOf(...ixOwnerRawWithdraw(owner, shiftKey, amount)), { expectFail: true }), {
      expectFail: true,
    });
  const redirect = () =>
    run(
      "Redirect payout to owner",
      async () => {
        // Same payout instruction staff would use, but the first person's account is swapped for the owner's.
        const targets = shift.staff.map((s, i) => (i === 0 ? ata(owner) : ata(s.wallet)));
        return send(txOf(...(await ixSettle(program, owner, shiftKey, shift, targets))), { expectFail: true });
      },
      { expectFail: true },
    );

  return (
    <section className="card owner-panel">
      <h2>👛 Owner controls</h2>
      {phase === "open" && (
        <>
          <div className="row">
            <button className="btn" onClick={() => run("End shift", async () => send(txOf(await ixEndShift(program, owner, shiftKey))))}>
              End shift now
            </button>
            <span className="muted small">Only moves the end time earlier. Tips keep flowing to the vault.</span>
          </div>
          <div className="roster-row">
            <input placeholder="Name (someone covering)" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
            <input className="mono" placeholder="Wallet address" value={wallet} onChange={(e) => setWallet(e.target.value)} />
            <button
              className="btn small"
              disabled={!name || !wallet}
              onClick={() =>
                run("Add staff", async () => send(txOf(...(await ixAddStaff(program, owner, shiftKey, new PublicKey(wallet.trim()), name.trim())))))
              }
            >
              Add
            </button>
          </div>
        </>
      )}
      <div className="attack">
        <h3>Try to take the tips</h3>
        <p className="muted small">
          These send real transactions that skip the wallet's safety check, so they land on devnet and fail there. Open the Explorer link
          in the notification to show the program error.
        </p>
        <div className="row">
          <button className="btn danger" onClick={rawWithdraw}>
            Withdraw {fromUnits(amount)} USDC from the vault
          </button>
          <button className="btn danger" onClick={redirect}>
            Pay out, but send {shift.staff[0]?.name}'s share to me
          </button>
        </div>
      </div>
    </section>
  );
}

function SettlePanel({ shiftKey, shift, phase, majority }: { shiftKey: PublicKey; shift: ShiftAccount; phase: string; majority: boolean }) {
  const program = useProgram();
  const { send, active } = useActors();
  const { run } = useToast();
  const ready = (phase !== "open" && majority) || phase === "fallback";
  const mode = majority ? "split by confirmed hours" : "equal split (no majority in time)";
  return (
    <section className={`card settle ${ready ? "ready" : ""}`}>
      <div className="row between">
        <div>
          <h2>Pay everyone</h2>
          <p className="muted small">
            {ready
              ? `Ready: ${mode}. Anyone can press this, including ${active.name}. The program decides who gets what.`
              : phase === "open"
                ? "Unlocks when the shift is over and more than half the staff confirm, or when the confirm window runs out."
                : "Waiting for more than half the staff to confirm the current hours, or for the confirm window to run out."}
          </p>
        </div>
        <button
          className="btn primary big-btn"
          disabled={!ready || !active.publicKey}
          onClick={() => run("Pay out tips", async () => send(txOf(...(await ixSettle(program, active.publicKey!, shiftKey, shift)))))}
        >
          Pay out now
        </button>
      </div>
    </section>
  );
}

function TipQr({ shiftKey }: { shiftKey: PublicKey }) {
  const url = `${window.location.origin}${window.location.pathname}#/tip/${shiftKey.toBase58()}`;
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: "#1d1b16", light: "#ffffff" } }).then(setSrc);
  }, [url]);
  return (
    <section className="card qr">
      <h2>Table QR</h2>
      {src && <img src={src} alt="QR code to the tip page" />}
      <a className="btn small" href={`#/tip/${shiftKey.toBase58()}`}>
        Open the guest's tip page →
      </a>
    </section>
  );
}

function OwnerCard({ shift }: { shift: ShiftAccount }) {
  const { connection } = useConnection();
  const { tick } = useToast();
  const [bal, setBal] = useState<bigint | null>(null);
  useInterval(() => tokenBalance(connection, ata(shift.owner)).then(setBal), 20000, [shift.owner.toBase58(), tick]);
  return (
    <section className="card owner-card">
      <span className="muted small">Owner's USDC balance</span>
      <span className="big">{bal === null ? "…" : fromUnits(bal)}</span>
      <span className="muted small">
        <a href={explorerAddr(shift.owner)} target="_blank" rel="noreferrer">
          {short(shift.owner)}
        </a>{" "}
        · not a cent of the tips passes through here
      </span>
    </section>
  );
}

function ActivityFeed({ activity }: { activity: Activity[] }) {
  return (
    <section className="card">
      <h2>On-chain activity</h2>
      {activity.length === 0 && <p className="muted small">Loading…</p>}
      <ul className="feed">
        {activity.map((a) => (
          <li key={a.signature} className={a.err ? "err" : ""}>
            <a href={explorerTx(a.signature)} target="_blank" rel="noreferrer">
              {a.err ? "✕ " : ""}
              {a.action}
              {a.err ? " (rejected)" : ""}
            </a>
            <span className="muted small">
              {a.time ? new Date(a.time * 1000).toLocaleTimeString() : ""} · {short(a.signer)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const hm = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
