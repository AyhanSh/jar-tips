import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useActors, type Actor } from "../actors";
import { useTx } from "../App";
import { useVenue } from "../data";
import { useChainNow, useProgram } from "../hooks";
import {
  MAX_NAME_BYTES,
  MAX_STAFF,
  MAX_STAFF_NAME_BYTES,
  byteLen,
  explorerAddr,
  fromUnits,
  ixCreateVenue,
  ixOpenShift,
  parseKey,
  short,
  statusOf,
  txOf,
} from "../solana";
import { Callout, ExtLink, Icon, Prop, Properties, Tag } from "../ui";

const WINDOWS = [
  { secs: 60, label: "1 minute (for demos)" },
  { secs: 3600, label: "1 hour" },
  { secs: 86400, label: "24 hours" },
];
const windowLabel = (s: number) => WINDOWS.find((w) => w.secs === s)?.label ?? `${s} seconds`;

export default function Venue() {
  const { owner } = useActors();
  const { tick } = useTx();
  const now = useChainNow();
  const { venue, shifts } = useVenue(owner.publicKey, tick);
  const [creating, setCreating] = useState(false);

  if (!owner.publicKey)
    return (
      <article className="doc">
        <h1 className="title">Venue</h1>
        <Callout icon="wallet">
          Connect a wallet in the sidebar to act as the owner. No browser wallet? Choose <b>Demo owner</b> under Signing as.
        </Callout>
      </article>
    );
  if (venue === undefined)
    return (
      <article className="doc">
        <div className="skeleton title-skel" />
        <div className="skeleton" />
      </article>
    );
  if (venue === null) return <CreateVenue owner={owner} />;

  return (
    <article className="doc">
      <h1 className="title">{venue.name}</h1>
      <Properties>
        <Prop icon="user" label="Owner">
          <ExtLink href={explorerAddr(owner.publicKey)}>{short(owner.publicKey)}</ExtLink>
          <span className="muted"> · {owner.name}</span>
        </Prop>
        <Prop icon="coins" label="Tip currency">
          USDC <span className="muted">(devnet test token)</span>
        </Prop>
        <Prop icon="clock" label="Time to agree">
          {windowLabel(venue.confirmWindow.toNumber())} after a shift ends
        </Prop>
        <Prop icon="hash" label="Shifts">
          {venue.shiftCount.toString()}
        </Prop>
      </Properties>

      <Callout icon="lock">
        As the owner you can open shifts, add people to a running shift and end it early. You can't withdraw tips, change hours,
        remove anyone or change how the pot is split.
      </Callout>

      <div className="section-head">
        <h2>Shifts</h2>
        {!creating && (
          <button className="btn primary small" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> New shift
          </button>
        )}
      </div>

      {creating && <OpenShift owner={owner} nextIndex={venue.shiftCount.toNumber()} onCancel={() => setCreating(false)} />}

      {shifts.length === 0 && !creating ? (
        <p className="muted">No shifts yet. Open one to get a tip QR code.</p>
      ) : (
        shifts.length > 0 && (
          <table className="db clickable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Opened</th>
                <th>Team</th>
                <th className="num">Tips</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map(({ key, acc }) => {
                const st = statusOf(acc, now);
                return (
                  <tr key={key.toBase58()} onClick={() => (window.location.hash = `/shift/${key.toBase58()}`)}>
                    <td>
                      <a href={`#/shift/${key.toBase58()}`} className="row-title">
                        {acc.label || `Shift ${acc.index.toNumber() + 1}`}
                      </a>
                    </td>
                    <td className="muted">{new Date(acc.openedAt.toNumber() * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className="muted">{acc.staff.map((s) => s.name).join(", ")}</td>
                    <td className="num">{fromUnits(acc.settled ? acc.paidOut : acc.totalTipped)}</td>
                    <td>
                      <Tag tone={st.tone}>{st.label}</Tag>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      )}
    </article>
  );
}

function CreateVenue({ owner }: { owner: Actor }) {
  const program = useProgram();
  const { send } = useActors();
  const { run, pending } = useTx();
  const [name, setName] = useState("Bistro Wisła");
  const [win, setWin] = useState(60);
  const nameErr = !name.trim() ? "Give your venue a name" : byteLen(name.trim()) > MAX_NAME_BYTES ? "That name is too long" : null;

  return (
    <article className="doc">
      <h1 className="title">Set up your venue</h1>
      <p className="lede">One time. This records a name, the tip currency and how long staff get to agree on hours.</p>
      <div className="form">
        <label className="field">
          <span>Venue name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
          {nameErr && <em className="field-err">{nameErr}</em>}
        </label>
        <label className="field">
          <span>Time staff get to agree on hours</span>
          <select value={win} onChange={(e) => setWin(Number(e.target.value))}>
            {WINDOWS.map((w) => (
              <option key={w.secs} value={w.secs}>
                {w.label}
              </option>
            ))}
          </select>
          <em className="field-hint">If they don't agree in time, anyone can split the pot equally.</em>
        </label>
        <div className="row gap">
          <button
            className="btn primary"
            disabled={!!nameErr || !!pending}
            onClick={() => run("Create venue", async () => send(txOf(await ixCreateVenue(program, owner.publicKey!, name.trim(), win)), { as: owner }))}
          >
            Create venue
          </button>
          <span className="muted small">Signed by {owner.name}</span>
        </div>
      </div>
    </article>
  );
}

interface Row {
  name: string;
  wallet: string;
}

function OpenShift({ owner, nextIndex, onCancel }: { owner: Actor; nextIndex: number; onCancel: () => void }) {
  const program = useProgram();
  const { actors, send } = useActors();
  const { run, pending } = useTx();
  const crew = actors.filter((a) => ["ana", "ben", "kasia"].includes(a.id));
  const [label, setLabel] = useState("Friday dinner");
  const [hours, setHours] = useState("8");
  const [rows, setRows] = useState<Row[]>(crew.map((a) => ({ name: a.name, wallet: a.publicKey!.toBase58() })));

  // Same checks the program makes, shown before anything is signed.
  const rowErr = rows.map((r, i) => {
    const key = parseKey(r.wallet);
    if (!r.name.trim()) return "Add a name";
    if (byteLen(r.name.trim()) > MAX_STAFF_NAME_BYTES) return "Name is too long (16 bytes max)";
    if (!key) return "Not a valid Solana address";
    if (owner.publicKey && key.equals(owner.publicKey)) return "The owner can't be on the tip roster";
    if (rows.findIndex((x) => parseKey(x.wallet)?.equals(key)) !== i) return "This wallet is already listed";
    return null;
  });
  const h = Number(hours);
  const hoursErr = !(h > 0 && h <= 24) ? "Between 0.1 and 24 hours" : null;
  const labelErr = byteLen(label.trim()) > MAX_NAME_BYTES ? "That name is too long" : null;
  const valid = rows.length > 0 && rowErr.every((e) => !e) && !hoursErr && !labelErr;
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const open = () =>
    run("Open shift", async () => {
      const { ix, shift } = await ixOpenShift(
        program,
        owner.publicKey!,
        nextIndex,
        label.trim(),
        Math.round(h * 60),
        rows.map((r) => ({ name: r.name.trim(), wallet: new PublicKey(r.wallet.trim()) })),
      );
      const r = await send(txOf(ix), { as: owner });
      if (!r.failed) window.location.hash = `/shift/${shift.toBase58()}`;
      return r;
    });

  return (
    <div className="panel">
      <div className="form two">
        <label className="field">
          <span>Shift name</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Friday dinner" />
          {labelErr && <em className="field-err">{labelErr}</em>}
        </label>
        <label className="field">
          <span>Length in hours</span>
          <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, ""))} />
          {hoursErr ? <em className="field-err">{hoursErr}</em> : <em className="field-hint">Tipping closes after this. Nobody can claim more hours.</em>}
        </label>
      </div>

      <div className="field-label">Team</div>
      <table className="db edit">
        <thead>
          <tr>
            <th style={{ width: "28%" }}>Name</th>
            <th>Wallet address</th>
            <th style={{ width: 36 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <input value={r.name} placeholder="Name" onChange={(e) => set(i, { name: e.target.value })} />
              </td>
              <td>
                <input className="mono" value={r.wallet} placeholder="Solana address" onChange={(e) => set(i, { wallet: e.target.value })} />
                {rowErr[i] && <em className="field-err">{rowErr[i]}</em>}
              </td>
              <td>
                <button className="icon-btn" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  <Icon name="x" size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row gap">
        <button className="btn ghost small" disabled={rows.length >= MAX_STAFF} onClick={() => setRows([...rows, { name: "", wallet: "" }])}>
          <Icon name="plus" size={14} /> Add person
        </button>
        <button className="btn ghost small" onClick={() => setRows(crew.map((a) => ({ name: a.name, wallet: a.publicKey!.toBase58() })))}>
          Use demo crew
        </button>
      </div>
      <p className="muted small">The team list is public. You can add people later, but nobody can ever be removed.</p>

      <div className="row gap end">
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" disabled={!valid || !!pending} onClick={open}>
          Open shift
        </button>
      </div>
    </div>
  );
}
