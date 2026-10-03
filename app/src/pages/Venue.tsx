import { useContext, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { DEMO_SHIFT, DemoMode } from "../demo";
import { useActors, type Actor } from "../actors";
import { useTx } from "../App";
import { useSol, useVenue, type ShiftRow } from "../data";
import { useChainNow, useProgram } from "../hooks";
import {
  MAX_NAME_BYTES,
  MAX_STAFF,
  MAX_STAFF_NAME_BYTES,
  byteLen,
  fromUnits,
  ixCreateVenue,
  ixOpenShift,
  parseKey,
  stageOf,
  statusOf,
  txOf,
  type VenueAccount,
} from "../solana";
import { Avatar, Callout, Icon, Tag } from "../ui";
import { Journey, NextStep, RoleTag } from "../journey";
import { ART } from "../art";

const WINDOWS = [
  { secs: 60, label: "1 minute (for demos)" },
  { secs: 3600, label: "1 hour" },
  { secs: 86400, label: "24 hours" },
];
const shiftName = (r: ShiftRow) => r.acc.label || `Shift ${r.acc.index.toNumber() + 1}`;

export default function Venue({ creating }: { creating: boolean }) {
  const { owner } = useActors();
  const { tick } = useTx();
  const { venue, shifts } = useVenue(owner.publicKey, tick);
  const demo = useContext(DemoMode);

  if (!owner.publicKey && !demo) return <ChooseOwner />;
  if (venue === undefined)
    return (
      <div className="page">
        <div className="skeleton journey-skel" />
        <div className="skeleton block" />
      </div>
    );
  if (venue === null) return <CreateVenue owner={owner} />;
  if (creating) return <OpenShift owner={owner} nextIndex={venue.shiftCount.toNumber()} venueName={venue.name} />;
  return <VenueHome venue={venue} shifts={shifts} owner={owner} />;
}

// ---------------------------------------------------------------------------
// 0 · nobody is the owner yet
// ---------------------------------------------------------------------------

function ChooseOwner() {
  const { setActive } = useActors();
  return (
    <div className="page">
      <Journey current={1} />
      <div className="choose">
        <h1 className="page-title">Who is the owner?</h1>
        <p className="page-desc">The owner sets up the venue and opens shifts. Pick one way to play the owner.</p>
      </div>
      <div className="options">
        <div className="option">
          <img src={ART.wallets} alt="" />
          <h3>Use your wallet</h3>
          <p>Phantom or Solflare, set to devnet.</p>
          <WalletMultiButton />
        </div>
        <div className="option featured">
          <span className="badge tone-green option-badge">Easiest</span>
          <img src={ART.store} alt="" />
          <h3>Use the demo owner</h3>
          <p>No wallet needed. Free devnet SOL included.</p>
          <button className="btn primary" onClick={() => setActive("owner")}>
            Play as demo owner <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Warns when the signer can't pay for the next step, and offers free devnet SOL. */
function NeedsSol({ actor, min }: { actor: Actor; min: number }) {
  const { run, pending, tick } = useTx();
  const sol = useSol(actor.publicKey, tick);
  const { fundCrew } = useActors();
  if (sol === null || sol >= min) return null;
  return actor.keypair ? (
    <Callout
      icon="coins"
      tone="orange"
      title={`${actor.name} needs a little devnet SOL first`}
      action={
        <button className="btn primary" disabled={!!pending} onClick={() => run("Free devnet SOL", async () => ({ signature: await fundCrew(), failed: false }))}>
          <Icon name="coins" size={14} /> Get free SOL
        </button>
      }
    >
      One click, no wallet needed. It also tops up Ana, Ben, Kasia and the guest.
    </Callout>
  ) : (
    <Callout icon="coins" tone="orange" title="Your wallet needs a little devnet SOL">
      Get some free at{" "}
      <a className="link-btn" href="https://faucet.solana.com" target="_blank" rel="noreferrer">
        faucet.solana.com
      </a>
      , or switch to the demo owner in the top bar.
    </Callout>
  );
}

// ---------------------------------------------------------------------------
// 1 · create the venue
// ---------------------------------------------------------------------------

function CreateVenue({ owner }: { owner: Actor }) {
  const program = useProgram();
  const { send } = useActors();
  const { run, pending } = useTx();
  const [name, setName] = useState("Bistro Wisła");
  const [win, setWin] = useState(60);
  const nameErr = !name.trim() ? "Give your venue a name" : byteLen(name.trim()) > MAX_NAME_BYTES ? "That name is too long" : null;

  return (
    <div className="page">
      <Journey current={1} />
      <NeedsSol actor={owner} min={0.004} />
      <div className="form-card">
        <div className="form-card-side">
          <img src={ART.store} alt="" />
          <h1 className="page-title">Create your venue</h1>
          <RoleTag role="owner">Owner · {owner.name}</RoleTag>
          <ul className="facts">
            <li className="yes"><Icon name="check" size={13} /> Saves the name and the rules</li>
            <li className="yes"><Icon name="check" size={13} /> Once per owner</li>
            <li className="no"><Icon name="x" size={13} /> Gives no access to tips</li>
          </ul>
        </div>
        <div className="form-card-main">
          <label className="field">
            <span>Venue name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <em className="field-hint">Guests see it on the tip page.</em>
            {nameErr && <em className="field-err">{nameErr}</em>}
          </label>
          <label className="field">
            <span>Time for staff to agree on hours</span>
            <select value={win} onChange={(e) => setWin(Number(e.target.value))}>
              {WINDOWS.map((w) => (
                <option key={w.secs} value={w.secs}>
                  {w.label}
                </option>
              ))}
            </select>
            <em className="field-hint">If they don't agree in time, anyone can split the pot equally.</em>
          </label>
          <button
            className="btn primary big"
            data-tour="create-venue"
            disabled={!!nameErr || !!pending}
            onClick={() => run("Create venue", async () => send(txOf(await ixCreateVenue(program, owner.publicKey!, name.trim(), win)), { as: owner }))}
          >
            Create venue <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// venue home: where you are, the one next step, every shift as a card
// ---------------------------------------------------------------------------

const NEXT: Record<1 | 2 | 3 | 4, { art: keyof typeof ART; title: (n: string) => string; text: string; role: "guest" | "staff" | "anyone" }> = {
  1: { art: "phone", title: (n) => `${n} is collecting tips`, text: "Show the QR to guests. When the shift ends, staff enter their hours.", role: "guest" },
  2: { art: "clock", title: (n) => `${n}: staff enter their hours`, text: "Each person enters only their own hours.", role: "staff" },
  3: { art: "team", title: (n) => `${n}: waiting for staff to agree`, text: "More than half of the team must agree on everyone's hours.", role: "staff" },
  4: { art: "split", title: (n) => `${n} is ready to pay out`, text: "Anyone can press Pay out. The program splits the pot.", role: "anyone" },
};

function VenueHome({ venue, shifts, owner }: { venue: VenueAccount; shifts: ShiftRow[]; owner: Actor }) {
  const now = useChainNow();
  const active = shifts.find((s) => !s.acc.settled);
  const stage = active ? stageOf(active.acc, now) : null;
  // Journey: 2 = open a shift; 3 = tips; 4 = hours and agreement; 5 = pay out.
  const journey = !active ? 2 : stage === 1 ? 3 : stage === 4 ? 5 : 4;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title-row">
            <h1 className="page-title">{venue.name}</h1>
            <RoleTag role="owner">Owner · {owner.name}</RoleTag>
          </div>
        </div>
        <div className="page-actions">
          <a className="btn primary" href="#/venue/new" data-tour="new-shift">
            <Icon name="plus" size={14} /> New shift
          </a>
        </div>
      </div>

      <Journey current={journey} />

      {active && stage && stage < 5 ? (
        <NextStep
          art={NEXT[stage as 1 | 2 | 3 | 4].art}
          eyebrow="Next step"
          role={NEXT[stage as 1 | 2 | 3 | 4].role}
          title={NEXT[stage as 1 | 2 | 3 | 4].title(shiftName(active))}
          text={NEXT[stage as 1 | 2 | 3 | 4].text}
          action={
            <a className="btn primary big" href={`#/shift/${active.key.toBase58()}`}>
              Go to shift <Icon name="arrowRight" size={14} />
            </a>
          }
        />
      ) : (
        <NextStep
          art="jar"
          eyebrow="Next step"
          role="owner"
          title={shifts.length ? "Open the next shift" : "Open your first shift"}
          text="List who's working. The program creates a tip vault and a QR code."
          action={
            <a className="btn primary big" href="#/venue/new">
              Open a shift <Icon name="arrowRight" size={14} />
            </a>
          }
        />
      )}

      {shifts.length > 0 && (
        <section>
          <h2 className="section-title">Shifts</h2>
          <div className="shift-cards">
            {shifts.map((r) => (
              <ShiftCard key={r.key.toBase58()} row={r} now={now} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

function ShiftCard({ row, now }: { row: ShiftRow; now: number }) {
  const { acc, key } = row;
  const st = statusOf(acc, now);
  const stage = stageOf(acc, now);
  const steps = ["Tips", "Hours", "Agree", "Paid"];
  // stage 1 → tips in progress; 2 hours; 3 agree; 4 ready (agree done); 5 paid
  const doneUpTo = stage === 5 ? 4 : stage === 4 ? 3 : stage - 1;
  return (
    <a className="shift-card" href={`#/shift/${key.toBase58()}`}>
      <div className="shift-card-top">
        <img src={acc.settled ? ART.split : ART.jar} alt="" />
        <Tag tone={st.tone}>{st.label}</Tag>
      </div>
      <div className="shift-card-title">{shiftName(row)}</div>
      <div className="shift-card-meta">
        #{acc.index.toNumber() + 1} · {new Date(acc.openedAt.toNumber() * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
      </div>
      <div className="shift-card-money">
        <b className="mono">{fromUnits(acc.settled ? acc.paidOut : acc.totalTipped)}</b> USDC · {acc.tipCount} tips
      </div>
      <div className="mini-steps" aria-label={`Progress: ${st.label}`}>
        {steps.map((s, i) => (
          <span key={s} className={i < doneUpTo ? "done" : i === doneUpTo && stage < 5 ? "current" : ""}>
            {s}
          </span>
        ))}
      </div>
      <div className="shift-card-team">
        <span className="faces">
          {acc.staff.slice(0, 5).map((s) => (
            <Avatar key={s.wallet.toBase58()} name={s.name} size={20} />
          ))}
        </span>
        <span className="muted small">{acc.staff.map((s) => s.name).join(", ")}</span>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// 2 · open a shift
// ---------------------------------------------------------------------------

interface Row {
  name: string;
  wallet: string;
}

function OpenShift({ owner, nextIndex, venueName }: { owner: Actor; nextIndex: number; venueName: string }) {
  const program = useProgram();
  const { actors, send } = useActors();
  const { run, pending } = useTx();
  const demo = useContext(DemoMode);
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

  const open = () => {
    // During the guide, jump to the sample shift instead of sending a transaction.
    if (demo) return void (window.location.hash = `/shift/${DEMO_SHIFT.toBase58()}`);
    return run("Open shift", async () => {
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
  };

  return (
    <div className="page">
      <Journey current={2} />
      {!demo && <NeedsSol actor={owner} min={0.013} />}
      <div className="page-header">
        <div>
          <div className="page-title-row">
            <h1 className="page-title">Open a shift</h1>
            <RoleTag role="owner">Owner · {owner.name}</RoleTag>
          </div>
          <p className="page-desc">{venueName} · creates a tip vault only the program controls, and a QR code for guests.</p>
        </div>
      </div>

      <div className="form-steps">
        <section className="form-step">
          <div className="form-step-head">
            <span className="stage-num">1</span>
            <div>
              <h3>The shift</h3>
              <p>A name and how long it lasts.</p>
            </div>
          </div>
          <div className="form-step-body two">
            <label className="field">
              <span>Name</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} />
              {labelErr && <em className="field-err">{labelErr}</em>}
            </label>
            <label className="field">
              <span>Length</span>
              <div className="input-suffix">
                <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, ""))} />
                <span>hours</span>
              </div>
              <em className="field-hint">Nobody can claim more hours than this.</em>
              {hoursErr && <em className="field-err">{hoursErr}</em>}
            </label>
          </div>
        </section>

        <section className="form-step">
          <div className="form-step-head">
            <span className="stage-num">2</span>
            <div>
              <h3>Who's working</h3>
              <p>These people share the tips. Public, add-only, and the owner can't be on it.</p>
            </div>
            <button className="btn" data-tour="demo-crew" onClick={() => setRows(crew.map((a) => ({ name: a.name, wallet: a.publicKey!.toBase58() })))}>
              <Icon name="users" size={14} /> Use demo crew
            </button>
          </div>
          <div className="form-step-body">
            {rows.map((r, i) => (
              <div className="crew-row" key={i}>
                <Avatar name={r.name || "?"} size={26} />
                <input value={r.name} placeholder="Name" onChange={(e) => set(i, { name: e.target.value })} />
                <input className="mono" value={r.wallet} placeholder="Solana wallet address" onChange={(e) => set(i, { wallet: e.target.value })} />
                <RoleTag role="staff" />
                <button className="icon-btn" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  <Icon name="x" size={14} />
                </button>
                {rowErr[i] && <em className="field-err crew-err">{rowErr[i]}</em>}
              </div>
            ))}
            <button className="btn ghost add-person" disabled={rows.length >= MAX_STAFF} onClick={() => setRows([...rows, { name: "", wallet: "" }])}>
              <Icon name="plus" size={14} /> Add person
            </button>
          </div>
        </section>

        <div className="form-submit">
          <a className="btn" href="#/venue">
            Cancel
          </a>
          <button className="btn primary big" data-tour="open-shift" disabled={!valid || !!pending} onClick={open}>
            Open shift <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

