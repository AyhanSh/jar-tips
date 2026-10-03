import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useActors, type Actor } from "../actors";
import { useToast } from "../App";
import { useInterval, useProgram } from "../hooks";
import {
  fromUnits,
  ixCreateVenue,
  ixOpenShift,
  shiftPda,
  txOf,
  venuePda,
  type ShiftAccount,
  type VenueAccount,
} from "../solana";

const WINDOWS = [
  { secs: 60, label: "1 minute (demo)" },
  { secs: 3600, label: "1 hour" },
  { secs: 86400, label: "24 hours" },
];

export default function Owner() {
  const program = useProgram();
  const { actors, active } = useActors();
  // The connected wallet is the owner; the demo owner keypair is a backup for live demos.
  const owner = active.id === "owner" ? active : actors[0];
  const { tick } = useToast();
  const [venue, setVenue] = useState<VenueAccount | null | undefined>(undefined);
  const [shifts, setShifts] = useState<{ key: PublicKey; acc: ShiftAccount }[]>([]);

  useInterval(
    async () => {
      if (!owner.publicKey) return;
      const v = await program.account.venue.fetchNullable(venuePda(owner.publicKey));
      setVenue(v);
      if (!v) return;
      const keys = Array.from({ length: v.shiftCount.toNumber() }, (_, i) => shiftPda(venuePda(owner.publicKey!), i)).reverse();
      const accs = await program.account.shift.fetchMultiple(keys);
      setShifts(keys.map((key, i) => ({ key, acc: accs[i]! })).filter((s) => s.acc));
    },
    10000,
    [owner.publicKey, tick],
  );

  if (!owner.publicKey)
    return (
      <div className="card narrow center">
        <h2>Connect the owner's wallet</h2>
        <p className="muted">
          Use the wallet button in the top-right (any Phantom or Solflare wallet on devnet), or switch “Acting as” to 🏪 Demo
          owner.
        </p>
      </div>
    );
  if (venue === undefined) return <div className="card narrow center muted">Loading venue…</div>;
  if (venue === null) return <CreateVenue owner={owner} />;

  return (
    <>
      <section className="card">
        <div className="row between">
          <div>
            <span className="eyebrow">Your venue</span>
            <h1>{venue.name}</h1>
            <p className="muted">
              Staff get {WINDOWS.find((w) => w.secs === venue.confirmWindow.toNumber())?.label ?? `${venue.confirmWindow.toNumber()}s`} after
              a shift to agree on hours. After that anyone can split the pot equally.
            </p>
          </div>
          <div className="owner-rights">
            <b>What you can do</b>
            <span className="yes">✓ open shifts, add staff, end a shift early</span>
            <span className="no">✕ withdraw, edit hours, remove staff, change the split</span>
          </div>
        </div>
      </section>
      <OpenShift owner={owner} nextIndex={venue.shiftCount.toNumber()} />
      <section className="card">
        <h2>Shifts</h2>
        {shifts.length === 0 && <p className="muted">No shifts yet.</p>}
        <div className="shift-list">
          {shifts.map(({ key, acc }) => (
            <a key={key.toBase58()} className="shift-item" href={`#/shift/${key.toBase58()}`}>
              <div>
                <b>{acc.label || `Shift #${acc.index.toNumber() + 1}`}</b>
                <div className="muted small">
                  {new Date(acc.openedAt.toNumber() * 1000).toLocaleString()} · {acc.staff.length} staff
                </div>
              </div>
              <div className="right">
                <b>{fromUnits(acc.settled ? acc.paidOut : acc.totalTipped)} USDC</b>
                <div className={`badge ${acc.settled ? "ok" : ""}`}>{acc.settled ? "paid out" : "open"}</div>
              </div>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}

function CreateVenue({ owner }: { owner: Actor }) {
  const program = useProgram();
  const { send } = useActors();
  const { run } = useToast();
  const [name, setName] = useState("Bistro Wisła");
  const [win, setWin] = useState(60);

  return (
    <section className="card narrow">
      <span className="eyebrow">Step 1 · one time</span>
      <h1>Register your venue</h1>
      <p className="muted">
        This only records your venue's name, the tip currency and the confirm window. It gives you no rights over any tips.
      </p>
      <label>
        Venue name
        <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Time staff get to agree on hours
        <select value={win} onChange={(e) => setWin(Number(e.target.value))}>
          {WINDOWS.map((w) => (
            <option key={w.secs} value={w.secs}>
              {w.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn primary"
        disabled={!name.trim()}
        onClick={() =>
          run("Create venue", async () => send(txOf(await ixCreateVenue(program, owner.publicKey!, name.trim(), win)), { as: owner }))
        }
      >
        Create venue
      </button>
    </section>
  );
}

function OpenShift({ owner, nextIndex }: { owner: Actor; nextIndex: number }) {
  const program = useProgram();
  const { actors, send } = useActors();
  const { run } = useToast();
  const crew = actors.filter((a) => ["ana", "ben", "kasia"].includes(a.id));
  const [label, setLabel] = useState("Friday dinner");
  const [hours, setHours] = useState(8);
  const [rows, setRows] = useState(crew.map((a) => ({ name: a.name, wallet: a.publicKey!.toBase58() })));

  const parsed = rows.map((r) => {
    try {
      return { name: r.name.trim(), wallet: new PublicKey(r.wallet.trim()) };
    } catch {
      return null;
    }
  });
  const valid = parsed.length > 0 && parsed.every((p) => p && p.name);

  const open = () =>
    run("Open shift", async () => {
      const { ixs, shift } = await ixOpenShift(
        program,
        owner.publicKey!,
        nextIndex,
        label.trim(),
        Math.round(hours * 60),
        parsed as { wallet: PublicKey; name: string }[],
      );
      const r = await send(txOf(...ixs), { as: owner });
      if (!r.failed) window.location.hash = `/shift/${shift.toBase58()}`;
      return r;
    });

  return (
    <section className="card">
      <h2>Open a shift</h2>
      <div className="grid2">
        <label>
          Shift name
          <input value={label} maxLength={32} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label>
          Scheduled length (hours): tipping closes after this, and nobody can claim more
          <input type="number" min={0.1} max={24} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
        </label>
      </div>
      <h3>Who is working</h3>
      <p className="muted small">The roster is public on-chain. You can add people later, but never remove anyone. You can't put yourself on it.</p>
      {rows.map((r, i) => (
        <div className="roster-row" key={i}>
          <input
            placeholder="Name"
            value={r.name}
            maxLength={16}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
          />
          <input
            className="mono"
            placeholder="Wallet address"
            value={r.wallet}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, wallet: e.target.value } : x)))}
          />
          <button className="btn ghost small" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <div className="row">
        <button className="btn ghost small" disabled={rows.length >= 12} onClick={() => setRows([...rows, { name: "", wallet: "" }])}>
          + Add person
        </button>
        <button
          className="btn ghost small"
          onClick={() => setRows(crew.map((a) => ({ name: a.name, wallet: a.publicKey!.toBase58() })))}
        >
          Use demo crew
        </button>
        <span className="spacer" />
        <button className="btn primary" disabled={!valid || hours <= 0} onClick={open}>
          Open shift & create vault
        </button>
      </div>
    </section>
  );
}
