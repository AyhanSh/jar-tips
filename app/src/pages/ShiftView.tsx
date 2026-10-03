import { useEffect, useMemo, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import QRCode from "qrcode";
import { useActors, type Actor, type SendResult } from "../actors";
import { useTx } from "../App";
import { useShift } from "../data";
import { formatDuration, useChainNow, useInterval, useProgram } from "../hooks";
import {
  MAX_STAFF,
  MAX_STAFF_NAME_BYTES,
  ata,
  byteLen,
  canSettle,
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
  missingAtaIxs,
  needed,
  parseKey,
  phaseOf,
  previewShares,
  short,
  statusOf,
  tokenBalance,
  txOf,
  vaultOf,
  type Activity,
  type ShiftAccount,
} from "../solana";
import { ART } from "../Onboarding";
import { Avatar, Callout, CopyButton, ExtLink, Icon, PageHeader, Panel, Prop, Properties, Stat, Tag } from "../ui";

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
  const { shift, venue, vault } = useShift(key, tick);

  if (!key) return <Empty text="That isn't a valid shift address." />;
  if (shift === undefined)
    return (
      <div className="page">
        <div className="skeleton title-skel" />
        <div className="stats">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton stat-skel" />
          ))}
        </div>
        <div className="skeleton block" />
      </div>
    );
  if (shift === null) return <Empty text="This shift doesn't exist on devnet." />;

  const phase = phaseOf(shift, now);
  const st = statusOf(shift, now);
  const pool = shift.settled ? BigInt(shift.paidOut.toString()) : vault;
  const closesAt = shift.closesAt.toNumber();
  const fallbackAt = closesAt + shift.confirmWindow.toNumber();
  const majority = hasMajority(shift);
  const equal = !majority && phase === "fallback";
  const shares = shift.settled ? shift.staff.map((s) => BigInt(s.paid.toString())) : previewShares(shift, pool, equal);
  const name = shift.label || `Shift ${shift.index.toNumber() + 1}`;

  const timing =
    phase === "open"
      ? { label: "Ends in", value: formatDuration(closesAt - now), sub: `at ${clock(closesAt)}` }
      : phase === "confirming"
        ? { label: "Equal split in", value: formatDuration(fallbackAt - now), sub: `ended ${clock(closesAt)}` }
        : phase === "fallback"
          ? { label: "Time to agree", value: "Passed", sub: `ended ${clock(closesAt)}` }
          : { label: "Paid out at", value: clock(shift.settledAt.toNumber()), sub: shift.byTimeout ? "equal split" : "split by hours" };

  return (
    <div className="page">
      <PageHeader
        title={name}
        badge={<Tag tone={st.tone}>{st.label}</Tag>}
        description={
          <>
            {venue?.name ?? "Venue"} · shift #{shift.index.toNumber() + 1} · opened {clock(shift.openedAt.toNumber())} · {hm(shift.scheduledMinutes)} scheduled
          </>
        }
        actions={
          !shift.settled && (
            <a className="btn" href={`#/tip/${key.toBase58()}`}>
              <Icon name="qr" size={14} /> Tip page
            </a>
          )
        }
      />

      <div className="stats">
        <Stat icon="coins" label={shift.settled ? "Paid to staff" : "In the vault"} value={<>{fromUnits(pool)} <small>USDC</small></>} sub={`${shift.tipCount} tip${shift.tipCount === 1 ? "" : "s"}`} />
        <Stat icon="users" label="Agreed" value={<>{confirmations(shift)} <small>/ {shift.staff.length}</small></>} sub={`${needed(shift)} needed for a majority`} />
        <Stat icon="clock" label={timing.label} value={timing.value} sub={timing.sub} />
        <Stat icon="activity" label="Split" value={shift.settled ? (shift.byTimeout ? "Equal" : "By hours") : equal ? "Equal" : "By hours"} sub={`version ${shift.version}`} />
      </div>

      <PayoutBanner shiftKey={key} shift={shift} now={now} />

      <Panel
        title="Team"
        description={shift.settled ? "What each person received." : "Shares update live. Any change to someone's hours resets everyone's agreement."}
        flush
      >
        <Team shift={shift} shares={shares} phase={phase} />
      </Panel>

      {!shift.settled && <YourPart shiftKey={key} shift={shift} phase={phase} pool={pool} />}

      <div className="two-col">
        {!shift.settled && <TipLink shiftKey={key} />}
        <Panel title="Accounts" description="Everything here is public and checkable.">
          <Properties>
            <Prop label="Vault">
              <ExtLink href={explorerAddr(vaultOf(key))}>
                <span className="mono">{short(vaultOf(key), 6)}</span>
              </ExtLink>
              <span className="muted">only the program can move it</span>
            </Prop>
            <Prop label="Shift">
              <ExtLink href={explorerAddr(key)}>
                <span className="mono">{short(key, 6)}</span>
              </ExtLink>
            </Prop>
            <OwnerProp shift={shift} />
          </Properties>
        </Panel>
      </div>

      <ActivityFeed shiftKey={key} />
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

function OwnerProp({ shift }: { shift: ShiftAccount }) {
  const { connection } = useConnection();
  const { tick } = useTx();
  const [bal, setBal] = useState<bigint | null>(null);
  useInterval(() => tokenBalance(connection, ata(shift.owner)).then(setBal), 20000, [shift.owner.toBase58(), tick]);
  return (
    <Prop label="Owner">
      <ExtLink href={explorerAddr(shift.owner)}>
        <span className="mono">{short(shift.owner, 6)}</span>
      </ExtLink>
      <span className="muted">holds {bal === null ? "…" : fromUnits(bal)} USDC · no access to the vault</span>
    </Prop>
  );
}

/** Pays out: first creates any missing staff token accounts, then calls `settle`. */
function usePayout(shiftKey: PublicKey, shift: ShiftAccount) {
  const program = useProgram();
  const { connection } = useConnection();
  const { send, active } = useActors();
  const { run } = useTx();
  return () =>
    run("Pay out", async (): Promise<SendResult> => {
      const caller = active.publicKey!;
      for (const chunk of await missingAtaIxs(connection, caller, shift.staff.map((s) => s.wallet))) {
        const r = await send(txOf(...chunk));
        if (r.failed) return r;
      }
      return send(txOf(await ixSettle(program, caller, shiftKey, shift)));
    });
}

function PayoutBanner({ shiftKey, shift, now }: { shiftKey: PublicKey; shift: ShiftAccount; now: number }) {
  const { active } = useActors();
  const { pending } = useTx();
  const payout = usePayout(shiftKey, shift);

  if (shift.settled)
    return (
      <div className="success-card">
        <img src={ART.split} alt="" />
        <div>
          <div className="alert-title">Paid out</div>
          <p className="alert-text">The vault was emptied straight into each person's wallet and then closed. The owner never held this money.</p>
        </div>
      </div>
    );
  if (!canSettle(shift, now)) return null;
  return (
    <Callout
      icon="coins"
      tone="green"
      title={hasMajority(shift) ? "Ready to pay out, split by hours" : "Ready to pay out, split equally"}
      action={
        <button className="btn primary" disabled={!!pending || !active.publicKey} onClick={payout}>
          Pay out now
        </button>
      }
    >
      Anyone can trigger this, including {active.name}. The program decides who gets what.
    </Callout>
  );
}

function Team({ shift, shares, phase }: { shift: ShiftAccount; shares: bigint[]; phase: string }) {
  const { active } = useActors();
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>Name</th>
          <th>Wallet</th>
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
                </span>
              </td>
              <td className="mono">
                <ExtLink href={explorerAddr(s.wallet)}>{short(s.wallet)}</ExtLink>
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

function YourPart({ shiftKey, shift, phase, pool }: { shiftKey: PublicKey; shift: ShiftAccount; phase: string; pool: bigint }) {
  const { active } = useActors();
  const entry = shift.staff.find((s) => active.publicKey && s.wallet.equals(active.publicKey));
  const isOwner = !!active.publicKey?.equals(shift.owner);
  const role = entry ? "staff" : isOwner ? "owner" : "someone outside the team";
  return (
    <Panel title="Your actions" description={`Signing as ${active.name} (${role}). Switch in the top bar to act as someone else.`} flush>
      {entry && <StaffPart shiftKey={shiftKey} shift={shift} phase={phase} me={active} />}
      {isOwner && <OwnerPart shiftKey={shiftKey} shift={shift} phase={phase} pool={pool} />}
      {!entry && !isOwner && (
        <div className="action-row">
          <div className="action-meta">
            <div className="action-title">Nothing to do here</div>
            <p>{active.name} isn't on this team. They can tip, or press Pay out once it's ready.</p>
          </div>
        </div>
      )}
    </Panel>
  );
}

function StaffPart({ shiftKey, shift, phase, me }: { shiftKey: PublicKey; shift: ShiftAccount; phase: string; me: Actor }) {
  const program = useProgram();
  const { send } = useActors();
  const { run, pending } = useTx();
  const entry = shift.staff.find((s) => s.wallet.equals(me.publicKey!))!;
  const initial = String((entry.submitted ? entry.minutes : shift.scheduledMinutes) / 60);
  const [hours, setHours] = useState(initial);
  useEffect(() => setHours(initial), [me.id, entry.minutes, entry.submitted]); // eslint-disable-line react-hooks/exhaustive-deps

  const minutes = Math.round(Number(hours) * 60);
  const tooMany = minutes > shift.scheduledMinutes;
  const invalid = hours === "" || !(Number(hours) >= 0) || tooMany;
  const unchanged = entry.submitted && minutes === entry.minutes;
  const agreed = entry.confirmedVersion === shift.version;

  return (
    <>
      <div className="action-row">
        <span className={`step-num ${entry.submitted ? "done" : ""}`}>{entry.submitted ? <Icon name="check" size={12} /> : "1"}</span>
        <div className="action-meta">
          <div className="action-title">Enter the hours you worked</div>
          <p>Only you can set your hours, up to {hm(shift.scheduledMinutes)}.</p>
          {tooMany && <em className="field-err">The shift was only {hm(shift.scheduledMinutes)}</em>}
        </div>
        <div className="action-control">
          <div className="input-suffix small">
            <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, ""))} />
            <span>hours</span>
          </div>
          <button
            className="btn"
            disabled={invalid || unchanged || !!pending}
            onClick={() => run("Save hours", async () => send(txOf(await ixSubmitHours(program, me.publicKey!, shiftKey, minutes))))}
          >
            {entry.submitted ? "Update" : "Save"}
          </button>
        </div>
      </div>
      <div className="action-row">
        <span className={`step-num ${agreed ? "done" : ""}`}>{agreed ? <Icon name="check" size={12} /> : "2"}</span>
        <div className="action-meta">
          <div className="action-title">Agree with everyone's hours</div>
          <p>
            {phase === "open"
              ? "Available once the shift is over."
              : agreed
                ? "You agreed. If anyone changes their hours, you'll be asked again."
                : "Check the team table. You're agreeing to these exact numbers."}
          </p>
        </div>
        <div className="action-control">
          <button
            className="btn primary"
            disabled={phase === "open" || agreed || !!pending}
            onClick={() => run("Agree to hours", async () => send(txOf(await ixConfirm(program, me.publicKey!, shiftKey, shift.version))))}
          >
            {agreed ? "Agreed" : "I agree"}
          </button>
        </div>
      </div>
    </>
  );
}

function OwnerPart({ shiftKey, shift, phase, pool }: { shiftKey: PublicKey; shift: ShiftAccount; phase: string; pool: bigint }) {
  const program = useProgram();
  const { send, active } = useActors();
  const { run, pending } = useTx();
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const owner = active.publicKey!;
  const key = parseKey(wallet);
  const addErr = !name.trim()
    ? null
    : byteLen(name.trim()) > MAX_STAFF_NAME_BYTES
      ? "Name is too long"
      : !key
        ? wallet
          ? "Not a valid address"
          : null
        : key.equals(owner)
          ? "The owner can't be on the roster"
          : shift.staff.some((s) => s.wallet.equals(key))
            ? "Already on the team"
            : null;

  // Ask for exactly what's in the vault: the Token program checks the balance before the authority.
  const rawWithdraw = () =>
    run("Withdraw as owner", async () => send(txOf(...ixOwnerRawWithdraw(owner, shiftKey, pool)), { expectFail: true }), { expectFail: true });
  // The real payout instruction, with the first person's account swapped for the owner's.
  const redirect = () =>
    run(
      "Redirect a share",
      async () =>
        send(txOf(await ixSettle(program, owner, shiftKey, shift, shift.staff.map((s, i) => (i === 0 ? ata(owner) : ata(s.wallet))))), {
          expectFail: true,
        }),
      { expectFail: true },
    );

  return (
    <>
      {phase === "open" && (
        <>
          <div className="action-row">
            <div className="action-meta">
              <div className="action-title">End the shift now</div>
              <p>Moves the end time earlier. Tips can still come in until payout.</p>
            </div>
            <div className="action-control">
              <button className="btn" disabled={!!pending} onClick={() => run("End shift", async () => send(txOf(await ixEndShift(program, owner, shiftKey))))}>
                End shift
              </button>
            </div>
          </div>
          <div className="action-row">
            <div className="action-meta">
              <div className="action-title">Add someone covering</div>
              <p>Adding resets everyone's agreement. Nobody can ever be removed.</p>
              {addErr && <em className="field-err">{addErr}</em>}
            </div>
            <div className="action-control wide">
              <input className="name-in" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="mono" placeholder="Wallet address" value={wallet} onChange={(e) => setWallet(e.target.value)} />
              <button
                className="btn"
                disabled={!name.trim() || !key || !!addErr || shift.staff.length >= MAX_STAFF || !!pending}
                onClick={() =>
                  run("Add person", async () => {
                    const r = await send(txOf(await ixAddStaff(program, owner, shiftKey, key!, name.trim())));
                    if (!r.failed) {
                      setName("");
                      setWallet("");
                    }
                    return r;
                  })
                }
              >
                Add
              </button>
            </div>
          </div>
        </>
      )}
      <div className="action-row danger-zone">
        <img className="row-art" src={ART.shield} alt="" />
        <div className="action-meta">
          <div className="action-title">Security test: try to take the tips</div>
          <p>
            Real transactions sent as the owner. They skip the wallet's safety check, reach devnet and fail there. Open them on Explorer
            from the notification.
          </p>
        </div>
        <div className="action-control stack">
          <button className="btn danger" disabled={!!pending} onClick={rawWithdraw}>
            Withdraw {fromUnits(pool)} USDC
          </button>
          <button className="btn danger" disabled={!!pending} onClick={redirect}>
            Send {shift.staff[0]?.name}'s share to me
          </button>
        </div>
      </div>
    </>
  );
}

function TipLink({ shiftKey }: { shiftKey: PublicKey }) {
  const url = `${window.location.origin}${window.location.pathname}#/tip/${shiftKey.toBase58()}`;
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: "#171717", light: "#ffffff" } }).then(setSrc);
  }, [url]);
  return (
    <Panel title="Tip link" description="Print it on the bill or put it on the table.">
      <div className="qr-block">
        {src && <img src={src} alt="QR code for the guest tip page" />}
        <div className="qr-side">
          <code className="code-line">{url.replace(/^https?:\/\//, "")}</code>
          <div className="row gap">
            <a className="btn" href={`#/tip/${shiftKey.toBase58()}`}>
              Open tip page
            </a>
            <CopyButton text={url} label="Copy link" />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function ActivityFeed({ shiftKey }: { shiftKey: PublicKey }) {
  const { connection } = useConnection();
  const { tick } = useTx();
  const [items, setItems] = useState<Activity[] | null>(null);
  useInterval(
    async () => {
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
    [shiftKey.toBase58(), tick],
  );
  return (
    <Panel title="Activity" description="Transactions that touched this shift or its vault, newest first." flush>
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
    </Panel>
  );
}
