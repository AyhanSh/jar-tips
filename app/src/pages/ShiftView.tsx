import { useContext, useEffect, useMemo, useState } from "react";
import { DEMO_SHIFT, DemoMode, demoActivity } from "../demo";
import { useDemoPeople } from "../data";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import QRCode from "qrcode";
import { useActors, useSignerFor, type Actor, type SendResult } from "../actors";
import { useTx } from "../App";
import { useShift } from "../data";
import { formatDuration, useChainNow, useInterval, useProgram } from "../hooks";
import {
  ata,
  canSettle,
  confirmations,
  explorerAddr,
  explorerTx,
  fromUnits,
  hasMajority,
  ixConfirm,
  ixEndShift,
  ixJoinShift,
  ixRawWithdraw,
  ixSettle,
  ixSubmitHours,
  loadActivity,
  missingAtaIxs,
  needed,
  parseKey,
  phaseOf,
  previewShares,
  short,
  stageOf,
  statusOf,
  tipUrl,
  tokenBalance,
  txOf,
  vaultOf,
  type Activity,
  type ShiftAccount,
  type TeamAccount,
} from "../solana";
import { ART } from "../art";
import { RoleTag } from "../journey";
import { Avatar, Callout, CopyButton, ExtLink, Icon, PageHeader, Panel, Tag } from "../ui";

const hm = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
const clock = (t: number) => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const stamp = (t: number) =>
  new Date(t * 1000).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function ShiftView({ address }: { address: string }) {
  const key = useMemo(() => parseKey(address), [address]);
  const { tick } = useTx();
  const now = useChainNow();
  const { shift, team, vault } = useShift(key, tick);
  const [qr, setQr] = useState(false);

  if (!key) return <Empty text="That isn't a valid shift address." />;
  if (shift === undefined)
    return (
      <div className="page">
        <div className="skeleton title-skel" />
        <div className="skeleton stat-skel" />
        <div className="skeleton block" />
      </div>
    );
  if (shift === null) return <Empty text="This shift doesn't exist on devnet." />;

  const phase = phaseOf(shift, now);
  const st = statusOf(shift, now);
  const pool = shift.settled ? BigInt(shift.paidOut.toString()) : vault;
  const majority = hasMajority(shift);
  const equal = !majority && phase === "fallback";
  const shares = shift.settled ? shift.staff.map((s) => BigInt(s.paid.toString())) : previewShares(shift, pool, equal);
  const name = shift.label || `Shift ${shift.index.toNumber() + 1}`;

  return (
    <div className="page">
      <PageHeader
        title={name}
        badge={<Tag tone={st.tone}>{st.label}</Tag>}
        description={`${team?.name ?? "Team"} · opened ${clock(shift.openedAt.toNumber())} · ${hm(shift.scheduledMinutes)} shift`}
        actions={
          !shift.settled && (
            <button className="btn primary" data-tour="tip-link" onClick={() => setQr(true)}>
              <Icon name="qr" size={14} /> Show QR
            </button>
          )
        }
      />

      <Summary shift={shift} pool={pool} phase={phase} now={now} />

      <PayoutBanner shiftKey={key} shift={shift} now={now} />

      {!shift.settled && <ShiftSteps shiftKey={key} shift={shift} team={team} phase={phase} pool={pool} now={now} />}

      <MoreTabs shiftKey={key} shift={shift} phase={phase} pool={pool} shares={shares} onShowQr={() => setQr(true)} />

      {qr && <QrFullscreen url={tipUrl(key)} onClose={() => setQr(false)} />}
    </div>
  );
}

/** One quiet line of numbers: the vault, the agreement, the clock. */
function Summary({ shift, pool, phase, now }: { shift: ShiftAccount; pool: bigint; phase: string; now: number }) {
  const closesAt = shift.closesAt.toNumber();
  const fallbackAt = closesAt + shift.confirmWindow.toNumber();
  const time =
    phase === "open"
      ? { value: formatDuration(closesAt - now), label: "until the shift ends" }
      : phase === "confirming"
        ? { value: formatDuration(fallbackAt - now), label: "left to agree" }
        : phase === "fallback"
          ? { value: "Over", label: "time to agree" }
          : { value: clock(shift.settledAt.toNumber()), label: shift.byTimeout ? "paid, equal split" : "paid, by hours" };
  return (
    <div className="summary" data-tour="stats">
      <div className="sum-main">
        <img src={shift.settled ? ART.split : ART.jar} alt="" />
        <div>
          <div className="sum-label">{shift.settled ? "Paid to staff" : "In the vault"}</div>
          <div className="sum-value">
            {fromUnits(pool)} <small>USDC</small>
          </div>
          <div className="sum-sub">
            {shift.tipCount} tip{shift.tipCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <div className="sum-item">
        <Icon name="users" size={18} />
        <div>
          <b>
            {confirmations(shift)} of {shift.staff.length}
          </b>
          <span>agreed · {needed(shift)} needed</span>
        </div>
      </div>
      <div className="sum-item">
        <Icon name="clock" size={18} />
        <div>
          <b>{time.value}</b>
          <span>{time.label}</span>
        </div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="page">
      <Callout icon="alert" tone="orange" title={text} />
    </div>
  );
}

/** Pays out as `as`: first creates any missing staff token accounts, then calls `settle`. */
function usePayout(shiftKey: PublicKey, shift: ShiftAccount) {
  const program = useProgram();
  const { connection } = useConnection();
  const { send } = useActors();
  const { run } = useTx();
  return (as: Actor) =>
    run(`Pay out (by ${as.name})`, async (): Promise<SendResult> => {
      const caller = as.publicKey!;
      for (const chunk of await missingAtaIxs(connection, caller, shift.staff.map((s) => s.wallet))) {
        const r = await send(txOf(...chunk), { as });
        if (r.failed) return r;
      }
      return send(txOf(await ixSettle(program, caller, shiftKey, shift)), { as });
    });
}

function PayoutBanner({ shift }: { shiftKey: PublicKey; shift: ShiftAccount; now: number }) {
  if (!shift.settled) return null;
  return (
    <div className="success-card">
      <img src={ART.split} alt="" />
      <div>
        <div className="alert-title">Paid out</div>
        <p className="alert-text">Straight to each wallet. No owner or middleman ever held it.</p>
      </div>
    </div>
  );
}

function Team({ shift, shares, phase }: { shift: ShiftAccount; shares: bigint[]; phase: string }) {
  const { active } = useActors();
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>Name</th>
          <th>Hours</th>
          <th>Agreed</th>
          <th className="num">{shift.settled ? "Paid (USDC)" : phase === "open" ? "Share so far" : "Will get"}</th>
        </tr>
      </thead>
      <tbody>
        {shift.staff.map((s, i) => {
          const me = active.publicKey?.equals(s.wallet);
          const agreed = s.confirmedVersion === shift.version;
          return (
            <tr key={s.wallet.toBase58()} className={me ? "me" : ""}>
              <td>
                <span className="cell-person">
                  <Avatar name={s.name} />
                  {s.name}
                  {me && <Tag tone="blue">you</Tag>}
                  <a className="icon-btn small" href={explorerAddr(s.wallet)} target="_blank" rel="noreferrer" title={s.wallet.toBase58()}>
                    <Icon name="external" size={11} />
                  </a>
                </span>
              </td>
              <td className="mono">{s.submitted ? hm(s.minutes) : <span className="muted">—</span>}</td>
              <td>
                {agreed ? (
                  <Tag tone="green">
                    <Icon name="check" size={11} /> agreed
                  </Tag>
                ) : s.confirmedVersion > 0 ? (
                  <Tag tone="yellow">re-check</Tag>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td className="num mono">
                <b>{fromUnits(shares[i] ?? 0n)}</b>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type StepState = "done" | "current" | "todo";

function Step({
  n,
  state,
  title,
  summary,
  who,
  hint,
  art,
  open,
  onToggle,
  children,
}: {
  n: number;
  state: StepState;
  title: string;
  summary: string;
  who: React.ReactNode;
  hint?: string;
  art: keyof typeof ART;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`flow-stage ${state} ${open ? "open" : ""}`}>
      <button className="stage-head" onClick={onToggle} aria-expanded={open}>
        <span className="stage-art">
          <img src={ART[art]} alt="" />
          <span className="stage-num">{state === "done" ? <Icon name="check" size={11} /> : n}</span>
        </span>
        <span className="stage-title">
          {title}
          {state === "current" && <Tag tone="green">now</Tag>}
        </span>
        <span className="stage-summary">{summary}</span>
        <Icon name="chevronDown" size={16} className="stage-caret" />
      </button>
      {open && (
        <div className="stage-body">
          <div className="stage-meta">
            {who}
            {hint && <span className="stage-hint">{hint}</span>}
          </div>
          {children}
        </div>
      )}
    </section>
  );
}

/** The whole shift as four steps. Every button says who it acts as, so nobody has to switch identities. */
function ShiftSteps({
  shiftKey,
  shift,
  team,
  phase,
  pool,
  now,
}: {
  shiftKey: PublicKey;
  shift: ShiftAccount;
  team: TeamAccount | null;
  phase: string;
  pool: bigint;
  now: number;
}) {
  const program = useProgram();
  const { send, actors, setActive } = useActors();
  const { run, pending } = useTx();
  const signerFor = useSignerFor();
  const payout = usePayout(shiftKey, shift);
  const [hours, setHours] = useState<Record<string, string>>({});
  // Anyone working the shift can end it; use the first of them this browser can sign for.
  const worker = shift.staff.map((s) => signerFor(s.wallet)).find((a) => a);
  const guest = actors.find((a) => a.id === "guest")!;
  // Team members left off the roster can add themselves.
  const missing = (team?.members ?? []).filter((m) => !shift.staff.some((s) => s.wallet.equals(m.wallet)));
  const open = phase === "open";
  const ready = canSettle(shift, now);
  const current = stageOf(shift, now); // 1-4 here: a paid-out shift doesn't render the steps
  const state = (n: number): StepState => (n < current ? "done" : n === current ? "current" : "todo");
  const agreed = confirmations(shift);
  const preview = previewShares(shift, pool, !hasMajority(shift) && phase === "fallback");
  // Pay out is open to anyone: use someone from the shift if this browser has them, else the guest.
  const payer = worker ?? guest;
  // Only the current step is open; click another to peek or act early.
  const [picked, setPicked] = useState<number | null>(null);
  const shown = picked ?? current;
  useEffect(() => setPicked(null), [current]); // progress moves the open step along
  const toggle = (n: number) => () => setPicked(shown === n ? 0 : n);
  const entered = shift.staff.filter((s) => s.submitted).length;

  return (
    <Panel tour="your-actions" title="What happens next" flush>

      <Step
        n={1}
        art="phone"
        state={state(1)}
        open={shown === 1}
        onToggle={toggle(1)}
        title="Collect tips"
        summary={`${fromUnits(pool)} USDC · ${shift.tipCount} tips`}
        who={<RoleTag role="guest">Guests tip · anyone working can end it</RoleTag>}
      >
        <div className="stage-actions">
          <button
            className="btn"
            onClick={() => {
              setActive("guest");
              window.location.hash = `/tip/${shiftKey.toBase58()}`;
            }}
          >
            <Avatar name="Guest" size={16} /> Tip as Guest
          </button>
          <span className="spacer" />
          {open && (
            <button
              className="btn"
              disabled={!worker || !!pending}
              title={worker ? "Ends it now instead of at the scheduled time" : "Only someone working this shift can end it"}
              onClick={() => run(`${worker!.name} ends the shift`, async () => send(txOf(await ixEndShift(program, worker!.publicKey!, shiftKey)), { as: worker }))}
            >
              <Avatar name={worker?.name ?? "Staff"} size={16} /> End shift as {worker?.name ?? "staff"}
            </button>
          )}
        </div>
      </Step>

      <Step
        n={2}
        art="clock"
        state={state(2)}
        open={shown === 2}
        onToggle={toggle(2)}
        title="Enter hours"
        summary={`${entered} of ${shift.staff.length} entered`}
        who={<RoleTag role="staff">Each person, only their own</RoleTag>}
        hint={`Max ${hm(shift.scheduledMinutes)} each`}
      >
        {shift.staff.map((s) => {
          const me = signerFor(s.wallet);
          const id = s.wallet.toBase58();
          const value = hours[id] ?? String(+((s.submitted ? s.minutes : shift.scheduledMinutes) / 60).toFixed(2));
          const minutes = Math.round(Number(value) * 60);
          const bad = value === "" || !(Number(value) >= 0) || minutes > shift.scheduledMinutes;
          const same = s.submitted && minutes === s.minutes;
          return (
            <div className="person-row" key={id}>
              <span className="cell-person">
                <Avatar name={s.name} /> {s.name}
              </span>
              <span className="person-state">{s.submitted ? <Tag tone="green">{hm(s.minutes)}</Tag> : <span className="muted small">not entered</span>}</span>
              {me ? (
                <span className="person-act">
                  <span className="input-suffix small">
                    <input inputMode="decimal" value={value} onChange={(e) => setHours({ ...hours, [id]: e.target.value.replace(/[^0-9.]/g, "") })} />
                    <span>h</span>
                  </span>
                  <button
                    className="btn"
                    disabled={bad || same || !!pending}
                    onClick={() => run(`${s.name} saves hours`, async () => send(txOf(await ixSubmitHours(program, s.wallet, shiftKey, minutes)), { as: me }))}
                  >
                    Save as {s.name}
                  </button>
                </span>
              ) : (
                <span className="muted small">Waiting for {s.name} to sign</span>
              )}
            </div>
          );
        })}
        {missing.map((m) => {
          const me = signerFor(m.wallet);
          return (
            <div className="person-row joinable" key={m.wallet.toBase58()}>
              <span className="cell-person">
                <Avatar name={m.name} /> {m.name}
              </span>
              <span className="person-state">
                <span className="muted small">on the team, not on this shift</span>
              </span>
              {me ? (
                <button
                  className="btn"
                  disabled={!!pending}
                  onClick={() => run(`${m.name} joins the shift`, async () => send(txOf(await ixJoinShift(program, m.wallet, shift.team, shiftKey)), { as: me }))}
                >
                  <Icon name="plus" size={13} /> {m.name} worked too
                </button>
              ) : (
                <span className="muted small">Only {m.name} can add themselves</span>
              )}
            </div>
          );
        })}
      </Step>

      <Step
        n={3}
        art="team"
        state={state(3)}
        open={shown === 3}
        onToggle={toggle(3)}
        summary={`${agreed} of ${shift.staff.length} agreed`}
        title="Agree on everyone's hours"
        who={<RoleTag role="staff">{`${agreed} of ${shift.staff.length} agreed · ${needed(shift)} needed`}</RoleTag>}
        hint={open ? "Opens when the shift ends" : "Any change to the hours resets agreement"}
      >
        {shift.staff.map((s) => {
          const me = signerFor(s.wallet);
          const ok = s.confirmedVersion === shift.version;
          return (
            <div className="person-row" key={s.wallet.toBase58()}>
              <span className="cell-person">
                <Avatar name={s.name} /> {s.name}
              </span>
              <span className="person-state">
                {ok ? <Tag tone="green"><Icon name="check" size={11} /> agreed</Tag> : s.confirmedVersion > 0 ? <Tag tone="yellow">re-check</Tag> : <span className="muted small">not yet</span>}
              </span>
              {me ? (
                <button
                  className="btn primary"
                  disabled={open || ok || !!pending}
                  onClick={() => run(`${s.name} agrees`, async () => send(txOf(await ixConfirm(program, s.wallet, shiftKey, shift.version)), { as: me }))}
                >
                  {s.name} agrees
                </button>
              ) : (
                <span className="muted small">Waiting for {s.name}</span>
              )}
            </div>
          );
        })}
      </Step>

      <Step
        n={4}
        art="split"
        state={state(4)}
        open={shown === 4}
        onToggle={toggle(4)}
        summary={ready ? "Ready" : "Later"}
        title="Pay out"
        who={<RoleTag role="anyone">Anyone can press it</RoleTag>}
        hint={ready ? (hasMajority(shift) ? "Split by hours" : "Nobody agreed in time: equal split") : "After most of the team agrees"}
      >
        <div className="stage-actions">
          <span className="payout-preview">
            {shift.staff.map((s, i) => (
              <span key={s.wallet.toBase58()}>
                {s.name} <b className="mono">{fromUnits(preview[i] ?? 0n)}</b>
              </span>
            ))}
          </span>
          <span className="spacer" />
          <button className="btn primary" disabled={!ready || !!pending} onClick={() => payout(payer)}>
            <Icon name="coins" size={14} /> Pay out now
          </button>
        </div>
      </Step>
    </Panel>
  );
}

/** Attempts by someone outside the team (the restaurant, say). Every one is a real transaction that fails. */
function CheatTools({ shiftKey, shift, pool }: { shiftKey: PublicKey; shift: ShiftAccount; pool: bigint }) {
  const program = useProgram();
  const { send, actors } = useActors();
  const { run, pending } = useTx();
  const outsider = actors.find((a) => a.id === "outsider")!;
  const who = outsider.publicKey!;

  // Ask for exactly what's in the vault: the Token program checks the balance before the authority.
  const rawWithdraw = () =>
    run("Restaurant tries to withdraw", async () => send(txOf(...ixRawWithdraw(who, shiftKey, pool)), { as: outsider, expectFail: true }), { expectFail: true });
  // The real payout instruction, with the first person's account swapped for the outsider's.
  const redirect = () =>
    run(
      "Restaurant tries to redirect a share",
      async () =>
        send(txOf(await ixSettle(program, who, shiftKey, shift, shift.staff.map((s, i) => (i === 0 ? ata(who) : ata(s.wallet))))), {
          as: outsider,
          expectFail: true,
        }),
      { expectFail: true },
    );
  const join = () =>
    run("Restaurant tries to join the shift", async () => send(txOf(await ixJoinShift(program, who, shift.team, shiftKey)), { as: outsider, expectFail: true }), {
      expectFail: true,
    });

  return (
    <>
      <div className="tab-intro">
        <RoleTag role="outsider">Acts as the restaurant</RoleTag>
        <span className="muted small">Not on the team, no rights in the program. Each try is a real devnet transaction.</span>
      </div>
      <div className="cheat-grid">
        <div className="cheat">
          <img src={ART.shield} alt="" />
          <b>Take the tips</b>
          <span>Move the vault's tokens straight out with the Token program.</span>
          <button className="btn danger" disabled={!!pending} onClick={rawWithdraw}>
            Withdraw {fromUnits(pool)} USDC
          </button>
        </div>
        <div className="cheat">
          <img src={ART.split} alt="" />
          <b>Redirect a share</b>
          <span>Call the real payout, but with {shift.staff[0]?.name}'s account swapped for its own.</span>
          <button className="btn danger" disabled={!!pending} onClick={redirect}>
            Send {shift.staff[0]?.name}'s share to me
          </button>
        </div>
        <div className="cheat">
          <img src={ART.team} alt="" />
          <b>Get on the roster</b>
          <span>Add itself to the shift to take a cut of the tips.</span>
          <button className="btn danger" disabled={!!pending} onClick={join}>
            Join this shift
          </button>
        </div>
      </div>
    </>
  );
}

function useQr(url: string) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 720, color: { dark: "#171717", light: "#ffffff" } }).then(setSrc);
  }, [url]);
  return src;
}

function TipLink({ shiftKey, onShowQr }: { shiftKey: PublicKey; onShowQr: () => void }) {
  const url = tipUrl(shiftKey);
  const src = useQr(url);
  const local = /localhost|127\.0\.0\.1/.test(url);
  return (
    <div className="qr-block">
      {src && (
        <button className="qr-thumb" onClick={onShowQr} title="Show full screen">
          <img src={src} alt="QR code for the guest tip page" />
        </button>
      )}
      <div className="qr-side">
        <code className="code-line">{url.replace(/^https?:\/\//, "")}</code>
        {local && (
          <p className="field-err">
            <Icon name="alert" size={12} /> Points to localhost, so phones can't open it. Set VITE_PUBLIC_URL.
          </p>
        )}
        <div className="row gap">
          <button className="btn primary" onClick={onShowQr}>
            <Icon name="qr" size={14} /> Full screen
          </button>
          <a className="btn" href={`#/tip/${shiftKey.toBase58()}`}>
            Open tip page
          </a>
          <CopyButton text={url} label="Copy link" />
        </div>
      </div>
    </div>
  );
}

/** Projector view: a big QR the audience can scan from their seats. */
function QrFullscreen({ url, onClose }: { url: string; onClose: () => void }) {
  const src = useQr(url);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qr-full">
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
        <img src={ART.phone} alt="" className="qr-full-art" />
        <h2>Scan to tip the team</h2>
        {src && <img className="qr-full-code" src={src} alt="QR code for the guest tip page" />}
        <div className="qr-full-steps">
          <span><b>1</b> Scan</span>
          <Icon name="arrowRight" size={14} />
          <span><b>2</b> Open in Phantom</span>
          <Icon name="arrowRight" size={14} />
          <span><b>3</b> Tip</span>
        </div>
        <code className="code-line">{url.replace(/^https?:\/\//, "")}</code>
      </div>
    </div>
  );
}

/** Everything that isn't the next action, one tab at a time. */
function MoreTabs({
  shiftKey,
  shift,
  phase,
  pool,
  shares,
  onShowQr,
}: {
  shiftKey: PublicKey;
  shift: ShiftAccount;
  phase: string;
  pool: bigint;
  shares: bigint[];
  onShowQr: () => void;
}) {
  const tabs = [
    { id: "team", label: "Team", icon: "users" },
    ...(!shift.settled ? [{ id: "qr", label: "Tip QR", icon: "qr" }] : []),
    ...(!shift.settled ? [{ id: "cheat", label: "Try to cheat", icon: "shield", tour: "security" }] : []),
    { id: "activity", label: "Activity", icon: "activity" },
  ];
  const [tab, setTab] = useState("team");
  return (
    <section className="panel tabs-panel" data-tour="team">
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? "on" : ""} ${t.id === "cheat" ? "tab-owner" : ""}`}
            data-tour={(t as { tour?: string }).tour}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={14} /> {t.label}
          </button>
        ))}
      </div>
      <div className="tab-body">
        {tab === "team" && <Team shift={shift} shares={shares} phase={phase} />}
        {tab === "qr" && <TipLink shiftKey={shiftKey} onShowQr={onShowQr} />}
        {tab === "cheat" && <CheatTools shiftKey={shiftKey} shift={shift} pool={pool} />}
        {tab === "activity" && (
          <>
            <div className="onchain">
              <span>
                <Icon name="lock" size={13} /> Vault{" "}
                <ExtLink href={explorerAddr(vaultOf(shiftKey))}>
                  <span className="mono">{short(vaultOf(shiftKey))}</span>
                </ExtLink>
              </span>
              <span>
                Shift{" "}
                <ExtLink href={explorerAddr(shiftKey)}>
                  <span className="mono">{short(shiftKey)}</span>
                </ExtLink>
              </span>
              <span>
                Team{" "}
                <ExtLink href={explorerAddr(shift.team)}>
                  <span className="mono">{short(shift.team)}</span>
                </ExtLink>
              </span>
            </div>
            <ActivityFeed shiftKey={shiftKey} />
          </>
        )}
      </div>
    </section>
  );
}

function ActivityFeed({ shiftKey }: { shiftKey: PublicKey }) {
  const { connection } = useConnection();
  const { tick } = useTx();
  const [items, setItems] = useState<Activity[] | null>(null);
  const demo = useContext(DemoMode) && shiftKey.equals(DEMO_SHIFT);
  const people = useDemoPeople();
  useInterval(
    async () => {
      if (demo) return setItems(demoActivity(people, Math.floor(Date.now() / 1000)));
      const a = await loadActivity(connection, shiftKey);
      const b = await loadActivity(connection, vaultOf(shiftKey));
      const seen = new Set<string>();
      setItems(
        [...a, ...b]
          .filter((x) => (seen.has(x.signature) ? false : (seen.add(x.signature), true)))
          .sort((x, y) => (y.time ?? 0) - (x.time ?? 0)),
      );
    },
    20000,
    [shiftKey.toBase58(), tick, demo],
  );
  return (
    <>
      {items === null ? (
        <div className="empty small">Loading from devnet…</div>
      ) : (
        <table className="grid log">
          <thead>
            <tr>
              <th style={{ width: 150 }}>Time</th>
              <th style={{ width: 90 }}>Status</th>
              <th>Event</th>
              <th>Signer</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.signature}>
                <td className="mono muted">{a.time ? stamp(a.time) : ""}</td>
                <td>{a.err ? <Tag tone="red">blocked</Tag> : <Tag tone="green">ok</Tag>}</td>
                <td>{a.action}</td>
                <td className="mono muted">{short(a.signer)}</td>
                <td>
                  <a className="icon-btn small" href={explorerTx(a.signature)} target="_blank" rel="noreferrer" aria-label="View on Explorer">
                    <Icon name="external" size={13} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
