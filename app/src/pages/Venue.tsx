import { useState, type ReactNode } from "react";
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
import { Callout, ExtLink, Icon, PageHeader, Panel, Prop, Properties, Tag } from "../ui";
import { ART } from "../Onboarding";

const WINDOWS = [
  { secs: 60, label: "1 minute (for demos)" },
  { secs: 3600, label: "1 hour" },
  { secs: 86400, label: "24 hours" },
];
const windowLabel = (s: number) => WINDOWS.find((w) => w.secs === s)?.label ?? `${s} seconds`;

/** Horizontal form row: label and hint on the left, control on the right. */
function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <div className="field-row">
      <div className="field-meta">
        <label>{label}</label>
        {hint && <p>{hint}</p>}
      </div>
      <div className="field-control">
        {children}
        {error && <em className="field-err">{error}</em>}
      </div>
    </div>
  );
}

export default function Venue({ creating }: { creating: boolean }) {
  const { owner } = useActors();
  const { tick } = useTx();
  const now = useChainNow();
  const { venue, shifts } = useVenue(owner.publicKey, tick);

  if (!owner.publicKey)
    return (
      <div className="page">
        <PageHeader title="Venue" description="Register a venue and open shifts." />
        <Callout icon="wallet" title="Connect a wallet to act as the owner">
          Use <b>Select Wallet</b> in the top bar. No browser wallet? Choose <b>Demo owner</b> in the signer menu.
        </Callout>
      </div>
    );
  if (venue === undefined)
    return (
      <div className="page">
        <div className="skeleton title-skel" />
        <div className="skeleton block" />
      </div>
    );
  if (venue === null) return <CreateVenue owner={owner} />;
  if (creating) return <OpenShift owner={owner} nextIndex={venue.shiftCount.toNumber()} venueName={venue.name} />;

  return (
    <div className="page">
      <PageHeader
        title={venue.name}
        description="Your venue's fixed settings and every shift you've opened."
        actions={
          <a className="btn primary" href="#/venue/new">
            <Icon name="plus" size={14} /> New shift
          </a>
        }
      />

      <Panel title="Shifts" flush>
        {shifts.length === 0 ? (
          <div className="empty">
            <img className="empty-art" src={ART.store} alt="" />
            <p>No shifts yet. Open one to get a tip vault and QR code.</p>
            <a className="btn" href="#/venue/new">
              New shift
            </a>
          </div>
        ) : (
          <table className="grid clickable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Opened</th>
                <th>Team</th>
                <th className="num">Tips (USDC)</th>
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
                    <td className="muted mono">{new Date(acc.openedAt.toNumber() * 1000).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="muted">{acc.staff.map((s) => s.name).join(", ")}</td>
                    <td className="num mono">{fromUnits(acc.settled ? acc.paidOut : acc.totalTipped)}</td>
                    <td>
                      <Tag tone={st.tone}>{st.label}</Tag>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Settings" description="Fixed when the venue was created. Nobody can change them.">
        <Properties>
          <Prop label="Owner">
            <ExtLink href={explorerAddr(owner.publicKey)}>
              <span className="mono">{short(owner.publicKey, 6)}</span>
            </ExtLink>
            <span className="muted">{owner.name}</span>
          </Prop>
          <Prop label="Tip currency">
            USDC <span className="muted">devnet test token</span>
          </Prop>
          <Prop label="Time to agree">{windowLabel(venue.confirmWindow.toNumber())} after a shift ends</Prop>
          <Prop label="Shifts opened">{venue.shiftCount.toString()}</Prop>
        </Properties>
      </Panel>

      <Callout icon="lock" title="What the owner can and can't do">
        You can open shifts, add people to a running shift and end it early. You can't withdraw tips, change anyone's hours, remove
        anyone or change how the pot is split.
      </Callout>
    </div>
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
    <div className="page narrow">
      <div className="intro-card">
        <img src={ART.store} alt="" />
        <div>
          <h1 className="page-title">Create your venue</h1>
          <p className="page-desc">One time per owner wallet. It records a name and the rules for every shift, and gives you no rights over any tips.</p>
        </div>
      </div>
      <Panel
        title="Venue details"
        footer={
          <>
            <span className="muted small">Signed by {owner.name}</span>
            <button
              className="btn primary"
              disabled={!!nameErr || !!pending}
              onClick={() => run("Create venue", async () => send(txOf(await ixCreateVenue(program, owner.publicKey!, name.trim(), win)), { as: owner }))}
            >
              Create venue
            </button>
          </>
        }
      >
        <Field label="Name" hint="Shown to guests on the tip page." error={nameErr}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Time to agree" hint="After a shift ends. If staff don't agree in time, anyone can split the pot equally.">
          <select value={win} onChange={(e) => setWin(Number(e.target.value))}>
            {WINDOWS.map((w) => (
              <option key={w.secs} value={w.secs}>
                {w.label}
              </option>
            ))}
          </select>
        </Field>
      </Panel>
    </div>
  );
}

interface Row {
  name: string;
  wallet: string;
}

function OpenShift({ owner, nextIndex, venueName }: { owner: Actor; nextIndex: number; venueName: string }) {
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
    <div className="page narrow">
      <PageHeader title="New shift" description={`At ${venueName}. Opening it creates the tip vault and a QR code.`} />
      <Panel title="Shift details">
        <Field label="Name" hint="For you and the staff, e.g. Friday dinner." error={labelErr}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Length" hint="Tipping closes after this. Nobody can claim more hours than this." error={hoursErr}>
          <div className="input-suffix">
            <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, ""))} />
            <span>hours</span>
          </div>
        </Field>
      </Panel>

      <Panel
        title="Team"
        description="Public on-chain. You can add people later but never remove anyone, and you can't add yourself."
        actions={
          <button className="btn tiny" onClick={() => setRows(crew.map((a) => ({ name: a.name, wallet: a.publicKey!.toBase58() })))}>
            Use demo crew
          </button>
        }
        flush
        footer={
          <>
            <button className="btn" disabled={rows.length >= MAX_STAFF} onClick={() => setRows([...rows, { name: "", wallet: "" }])}>
              <Icon name="plus" size={14} /> Add person
            </button>
            <span className="spacer" />
            <a className="btn" href="#/venue">
              Cancel
            </a>
            <button className="btn primary" disabled={!valid || !!pending} onClick={open}>
              Open shift
            </button>
          </>
        }
      >
        <table className="grid edit">
          <thead>
            <tr>
              <th style={{ width: "30%" }}>Name</th>
              <th>Wallet address</th>
              <th style={{ width: 44 }} />
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
      </Panel>
    </div>
  );
}
