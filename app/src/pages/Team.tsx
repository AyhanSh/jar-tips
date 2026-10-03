import { useContext, useState } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { DEMO_SHIFT, DemoMode } from "../demo";
import { useActors, useSignerFor, type Actor } from "../actors";
import { useTx } from "../App";
import { useMyTeam, useSol, type ShiftRow } from "../data";
import { useChainNow, useProgram } from "../hooks";
import {
  MAX_NAME_BYTES,
  MAX_STAFF,
  MAX_STAFF_NAME_BYTES,
  PROPOSAL_TTL,
  byteLen,
  explorerAddr,
  fromUnits,
  ixCreateTeam,
  ixOpenShift,
  ixPropose,
  ixVote,
  majorityOf,
  parseKey,
  short,
  stageOf,
  statusOf,
  txOf,
  votedBy,
  type TeamAccount,
} from "../solana";
import { Avatar, Callout, ExtLink, Icon, Panel, Tag } from "../ui";
import { Journey, NextStep, RoleTag } from "../journey";
import { ART } from "../art";

const WINDOWS = [
  { secs: 60, label: "1 minute (for demos)" },
  { secs: 3600, label: "1 hour" },
  { secs: 86400, label: "24 hours" },
];
const shiftName = (r: ShiftRow) => r.acc.label || `Shift ${r.acc.index.toNumber() + 1}`;

export default function Team({ creating }: { creating: boolean }) {
  const { me, meChosen } = useActors();
  const { key, team, shifts } = useMyTeam();
  const demo = useContext(DemoMode);

  if (!meChosen && !demo) return <ChooseMe />;
  if (team === undefined)
    return (
      <div className="page">
        <div className="skeleton journey-skel" />
        <div className="skeleton block" />
      </div>
    );
  if (team === null || !key) return <CreateTeam me={me} />;
  if (creating) return <OpenShift teamKey={key} team={team} />;
  return <TeamHome teamKey={key} team={team} shifts={shifts} />;
}

/** The member of `team` this browser acts as: you if you're on it, else the first local member. */
function useActing(team: TeamAccount): Actor | undefined {
  const { me } = useActors();
  const signerFor = useSignerFor();
  const locals = team.members.map((m) => signerFor(m.wallet)).filter((a): a is Actor => !!a);
  return locals.find((a) => a.id === me.id) ?? locals[0];
}

// ---------------------------------------------------------------------------
// 0 · who are you
// ---------------------------------------------------------------------------

function ChooseMe() {
  const { setActive } = useActors();
  return (
    <div className="page">
      <Journey current={1} />
      <div className="choose">
        <h1 className="page-title">Who are you on the team?</h1>
        <p className="page-desc">There's no owner. Someone who works there starts the jar for everyone.</p>
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
          <img src={ART.team} alt="" />
          <h3>Play as Ana, a waiter</h3>
          <p>No wallet needed. Free devnet SOL included.</p>
          <button className="btn primary" onClick={() => setActive("ana")}>
            Play as Ana <Icon name="arrowRight" size={14} />
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
      One click, no wallet needed. It also tops up the rest of the demo team and the guest.
    </Callout>
  ) : (
    <Callout icon="coins" tone="orange" title="Your wallet needs a little devnet SOL">
      Get some free at{" "}
      <a className="link-btn" href="https://faucet.solana.com" target="_blank" rel="noreferrer">
        faucet.solana.com
      </a>
      , or play as Ana from the top bar.
    </Callout>
  );
}

// ---------------------------------------------------------------------------
// 1 · start the team
// ---------------------------------------------------------------------------

interface Row {
  name: string;
  wallet: string;
}

function CreateTeam({ me }: { me: Actor }) {
  const program = useProgram();
  const { actors, send } = useActors();
  const { run, pending } = useTx();
  const [name, setName] = useState("Bistro Wisła");
  const [win, setWin] = useState(60);
  const coworkers = actors.filter((a) => ["ana", "ben", "kasia"].includes(a.id) && a.id !== me.id);
  const [rows, setRows] = useState<Row[]>(() => [
    { name: me.id === "wallet" ? "" : me.name, wallet: me.publicKey?.toBase58() ?? "" },
    ...coworkers.map((a) => ({ name: a.name, wallet: a.publicKey!.toBase58() })),
  ]);
  const nameErr = !name.trim() ? "Give your team a name" : byteLen(name.trim()) > MAX_NAME_BYTES ? "That name is too long" : null;
  // Same checks the program makes, shown before anything is signed.
  const rowErr = rows.map((r, i) => {
    const key = parseKey(r.wallet);
    if (!r.name.trim()) return i === 0 ? "Add your name" : "Add a name";
    if (byteLen(r.name.trim()) > MAX_STAFF_NAME_BYTES) return "Name is too long (16 bytes max)";
    if (!key) return "Not a valid Solana address";
    if (rows.findIndex((x) => parseKey(x.wallet)?.equals(key)) !== i) return "This wallet is already listed";
    return null;
  });
  const valid = !nameErr && rowErr.every((e) => !e) && !!me.publicKey;
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="page">
      <Journey current={1} />
      <NeedsSol actor={me} min={0.01} />
      <div className="form-card">
        <div className="form-card-side">
          <img src={ART.team} alt="" />
          <h1 className="page-title">Start your team</h1>
          <RoleTag role="staff">Started by {me.name}</RoleTag>
          <ul className="facts">
            <li className="yes"><Icon name="check" size={13} /> No owner, no admin key</li>
            <li className="yes"><Icon name="check" size={13} /> Team changes need a majority</li>
            <li className="no"><Icon name="x" size={13} /> Nobody can withdraw tips</li>
          </ul>
        </div>
        <div className="form-card-main">
          <label className="field">
            <span>Team name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <em className="field-hint">Usually the restaurant. Guests see it on the tip page.</em>
            {nameErr && <em className="field-err">{nameErr}</em>}
          </label>
          <div className="field">
            <span>Who's on the team</span>
            {rows.map((r, i) => (
              <div className="crew-row" key={i}>
                <Avatar name={r.name || "?"} size={26} />
                <input value={r.name} placeholder={i === 0 ? "Your name" : "Name"} onChange={(e) => set(i, { name: e.target.value })} />
                <input className="mono" value={r.wallet} placeholder="Solana wallet address" disabled={i === 0} onChange={(e) => set(i, { wallet: e.target.value })} />
                {i === 0 ? (
                  <Tag tone="blue">you</Tag>
                ) : (
                  <button className="icon-btn" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    <Icon name="x" size={14} />
                  </button>
                )}
                {rowErr[i] && <em className="field-err crew-err">{rowErr[i]}</em>}
              </div>
            ))}
            <button className="btn ghost add-person" disabled={rows.length >= MAX_STAFF} onClick={() => setRows([...rows, { name: "", wallet: "" }])}>
              <Icon name="plus" size={14} /> Add person
            </button>
          </div>
          <label className="field">
            <span>Time to agree on hours</span>
            <select value={win} onChange={(e) => setWin(Number(e.target.value))}>
              {WINDOWS.map((w) => (
                <option key={w.secs} value={w.secs}>
                  {w.label}
                </option>
              ))}
            </select>
            <em className="field-hint">If the team doesn't agree in time, anyone can split the pot equally.</em>
          </label>
          <button
            className="btn primary big"
            data-tour="create-team"
            disabled={!valid || !!pending}
            onClick={() =>
              run("Start team", async () =>
                send(
                  txOf(
                    await ixCreateTeam(
                      program,
                      me.publicKey!,
                      name.trim(),
                      win,
                      rows.map((r) => ({ name: r.name.trim(), wallet: new PublicKey(r.wallet.trim()) })),
                    ),
                  ),
                  { as: me },
                ),
              )
            }
          >
            Start team <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// team home: where you are, the one next step, every shift as a card, the team
// ---------------------------------------------------------------------------

const NEXT: Record<1 | 2 | 3 | 4, { art: keyof typeof ART; title: (n: string) => string; text: string; role: "guest" | "staff" | "anyone" }> = {
  1: { art: "phone", title: (n) => `${n} is collecting tips`, text: "Show the QR to guests. When the shift ends, everyone enters their hours.", role: "guest" },
  2: { art: "clock", title: (n) => `${n}: enter your hours`, text: "Each person enters only their own hours.", role: "staff" },
  3: { art: "team", title: (n) => `${n}: waiting for the team to agree`, text: "More than half of the shift must agree on everyone's hours.", role: "staff" },
  4: { art: "split", title: (n) => `${n} is ready to pay out`, text: "Anyone can press Pay out. The program splits the pot.", role: "anyone" },
};

function TeamHome({ teamKey, team, shifts }: { teamKey: PublicKey; team: TeamAccount; shifts: ShiftRow[] }) {
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
            <h1 className="page-title">{team.name}</h1>
            <span className="chip yes">
              <Icon name="users" size={12} /> Run by its {team.members.length} staff · no owner
            </span>
          </div>
        </div>
        <div className="page-actions">
          <a className="btn primary" href="#/team/new" data-tour="new-shift">
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
          role="staff"
          title={shifts.length ? "Open the next shift" : "Open your first shift"}
          text="Anyone on the team can. Pick who's working; the program creates a tip vault and a QR code."
          action={
            <a className="btn primary big" href="#/team/new">
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

      <TeamPanel teamKey={teamKey} team={team} now={now} />
    </div>
  );
}

/** Who's on the team, and the one open change they're voting on. */
function TeamPanel({ teamKey, team, now }: { teamKey: PublicKey; team: TeamAccount; now: number }) {
  const program = useProgram();
  const { send, me } = useActors();
  const { run, pending } = useTx();
  const signerFor = useSignerFor();
  const acting = useActing(team);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const p = team.proposal;
  const n = team.members.length;
  const voted = p ? votedBy(team, p) : [];
  const expired = !!p && now >= p.createdAt.toNumber() + PROPOSAL_TTL;
  // Only the proposer can replace an open proposal (or anyone, once it has expired).
  const blocked = !!p && !expired && !(acting?.publicKey && p.proposer.equals(acting.publicKey));
  const key = parseKey(wallet);
  const addErr = !name.trim()
    ? null
    : byteLen(name.trim()) > MAX_STAFF_NAME_BYTES
      ? "Name is too long"
      : !key
        ? wallet
          ? "Not a valid address"
          : null
        : team.members.some((m) => m.wallet.equals(key))
          ? "Already on the team"
          : null;
  const nameOf = (w: PublicKey) => team.members.find((m) => m.wallet.equals(w))?.name ?? short(w);

  const propose = (add: boolean, w: PublicKey, nm = "") =>
    run(add ? `${acting!.name} proposes adding ${nm}` : `${acting!.name} proposes removing ${nameOf(w)}`, async () => {
      const r = await send(txOf(await ixPropose(program, acting!.publicKey!, teamKey, add, w, nm)), { as: acting });
      if (!r.failed && add) {
        setAdding(false);
        setName("");
        setWallet("");
      }
      return r;
    });

  return (
    <Panel
      tour="crew"
      title={
        <span className="title-art">
          <img src={ART.team} alt="" /> The team
        </span>
      }
      description={`No owner. Adding or removing someone needs ${majorityOf(n)} of ${n} votes.`}
      actions={
        acting && (
          <button className="btn" disabled={blocked || n >= MAX_STAFF || !!pending} onClick={() => setAdding((a) => !a)} title={blocked ? "Vote on the open proposal first" : ""}>
            <Icon name="plus" size={14} /> Propose someone
          </button>
        )
      }
      flush
    >
      {p && (
        <div className="vote-card">
          <div className="vote-head">
            <Avatar name={p.add ? p.name : nameOf(p.wallet)} size={30} />
            <div className="vote-text">
              <b>
                {p.add ? "Add" : "Remove"} {p.add ? p.name : nameOf(p.wallet)}
              </b>
              <span className="muted small">
                proposed by {nameOf(p.proposer)} · <span className="mono">{short(p.wallet)}</span>
                {expired && " · expired"}
              </span>
            </div>
            <span className="vote-count">
              <b>
                {voted.length} of {n}
              </b>{" "}
              votes · {majorityOf(n)} needed
            </span>
          </div>
          <div className="vote-bar">
            <span style={{ width: `${(voted.length / n) * 100}%` }} />
            <i style={{ left: `${(majorityOf(n) / n) * 100}%` }} />
          </div>
          <div className="vote-people">
            {team.members.map((m) => {
              const yes = voted.some((v) => v.wallet.equals(m.wallet));
              const signer = signerFor(m.wallet);
              return yes ? (
                <span key={m.wallet.toBase58()} className="chip yes">
                  <Icon name="check" size={12} /> {m.name}
                </span>
              ) : signer && !expired ? (
                <button
                  key={m.wallet.toBase58()}
                  className="btn primary"
                  disabled={!!pending}
                  onClick={() => run(`${m.name} approves`, async () => send(txOf(await ixVote(program, m.wallet, teamKey, p.id)), { as: signer }))}
                >
                  <Avatar name={m.name} size={16} /> {m.name} approves
                </button>
              ) : (
                <span key={m.wallet.toBase58()} className="chip">
                  {m.name} · waiting
                </span>
              );
            })}
          </div>
        </div>
      )}

      {adding && acting && (
        <div className="action-row">
          <div className="action-meta">
            <div className="action-title">Propose adding someone</div>
            <p>
              As {acting.name}. Counts as your vote; {majorityOf(n) > 1 ? `${majorityOf(n) - 1} more needed.` : "passes right away."}
            </p>
            {addErr && <em className="field-err">{addErr}</em>}
          </div>
          <div className="action-control wide">
            <input className="name-in" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="mono" placeholder="Wallet address" value={wallet} onChange={(e) => setWallet(e.target.value)} />
            <button className="btn ghost" title="Fill in a fresh test address" onClick={() => setWallet(Keypair.generate().publicKey.toBase58())}>
              Test address
            </button>
            <button className="btn primary" disabled={!name.trim() || !key || !!addErr || !!pending} onClick={() => propose(true, key!, name.trim())}>
              Propose
            </button>
          </div>
        </div>
      )}

      <div className="people">
        {team.members.map((m) => {
          const local = signerFor(m.wallet);
          return (
            <div className="person" key={m.wallet.toBase58()}>
              <Avatar name={m.name} size={30} />
              <div className="person-text">
                <div className="person-name">
                  {m.name} {local?.id === me.id && <Tag tone="blue">you</Tag>}
                </div>
                <div className="person-role">
                  <ExtLink href={explorerAddr(m.wallet)}>
                    <span className="mono">{short(m.wallet)}</span>
                  </ExtLink>
                </div>
              </div>
              {acting && n > 1 && (
                <button
                  className="icon-btn small"
                  disabled={blocked || !!pending}
                  title={blocked ? "Vote on the open proposal first" : `Propose removing ${m.name}`}
                  aria-label={`Propose removing ${m.name}`}
                  onClick={() => propose(false, m.wallet)}
                >
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
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

function OpenShift({ teamKey, team }: { teamKey: PublicKey; team: TeamAccount }) {
  const program = useProgram();
  const { send } = useActors();
  const { run, pending } = useTx();
  const demo = useContext(DemoMode);
  const acting = useActing(team);
  const [label, setLabel] = useState("Friday dinner");
  const [hours, setHours] = useState("8");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(team.members.map((m) => m.wallet.toBase58())));

  const h = Number(hours);
  const hoursErr = !(h > 0 && h <= 24) ? "Between 0.1 and 24 hours" : null;
  const labelErr = byteLen(label.trim()) > MAX_NAME_BYTES ? "That name is too long" : null;
  const valid = picked.size > 0 && !hoursErr && !labelErr && !!acting;
  const toggle = (w: string) => {
    const next = new Set(picked);
    if (next.has(w)) next.delete(w);
    else next.add(w);
    setPicked(next);
  };

  const open = () => {
    // During the guide, jump to the sample shift instead of sending a transaction.
    if (demo) return void (window.location.hash = `/shift/${DEMO_SHIFT.toBase58()}`);
    return run(`${acting!.name} opens the shift`, async () => {
      const { ix, shift } = await ixOpenShift(
        program,
        acting!.publicKey!,
        teamKey,
        team.shiftCount.toNumber(),
        label.trim(),
        Math.round(h * 60),
        team.members.filter((m) => picked.has(m.wallet.toBase58())).map((m) => m.wallet),
      );
      const r = await send(txOf(ix), { as: acting });
      if (!r.failed) window.location.hash = `/shift/${shift.toBase58()}`;
      return r;
    });
  };

  return (
    <div className="page">
      <Journey current={2} />
      {!demo && acting && <NeedsSol actor={acting} min={0.012} />}
      <div className="page-header">
        <div>
          <div className="page-title-row">
            <h1 className="page-title">Open a shift</h1>
            {acting && <RoleTag role="staff">Opened by {acting.name}</RoleTag>}
          </div>
          <p className="page-desc">{team.name} · creates a tip vault only the program controls, and a QR code for guests.</p>
        </div>
      </div>
      {!acting && (
        <Callout icon="alert" tone="orange" title="Only team members can open a shift">
          None of the people on this team can sign in this browser.
        </Callout>
      )}

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
              <p>Only team members. Anyone left out can add themselves later.</p>
            </div>
          </div>
          <div className="form-step-body pick-grid" data-tour="workers">
            {team.members.map((m) => {
              const on = picked.has(m.wallet.toBase58());
              return (
                <button key={m.wallet.toBase58()} className={`pick ${on ? "on" : ""}`} aria-pressed={on} onClick={() => toggle(m.wallet.toBase58())}>
                  <Avatar name={m.name} size={26} />
                  <span>{m.name}</span>
                  <span className="pick-box">{on && <Icon name="check" size={12} />}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="form-submit">
          <a className="btn" href="#/team">
            Cancel
          </a>
          <button className="btn primary big" data-tour="open-shift" disabled={!valid || !!pending} onClick={open}>
            Open shift {acting && `as ${acting.name}`} <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
