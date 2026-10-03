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
import { Avatar, Callout, ExtLink, Icon, Prop, Properties, Tag } from "../ui";

const hm = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
const clock = (t: number) => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function ShiftView({ address }: { address: string }) {
  const key = useMemo(() => parseKey(address), [address]);
  const { tick } = useTx();
  const now = useChainNow();
  const { shift, venue, vault } = useShift(key, tick);

  if (!key) return <Empty text="That isn't a valid shift address." />;
  if (shift === undefined)
    return (
      <article className="doc">
        <div className="skeleton title-skel" />
        <div className="skeleton" />
        <div className="skeleton" />
      </article>
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

  return (
    <article className="doc">
      <div className="crumbs">
        <a href="#/venue">{venue?.name ?? "Venue"}</a>
        <Icon name="chevronRight" size={12} />
        <span>{name}</span>
      </div>
      <h1 className="title">{name}</h1>

      <Properties>
        <Prop icon="activity" label="Status">
          <Tag tone={st.tone}>{st.label}</Tag>
        </Prop>
        <Prop icon="clock" label={phase === "open" ? "Ends" : phase === "settled" ? "Paid out" : "Ended"}>
          {phase === "open" && (
            <>
              {clock(closesAt)} <span className="muted">· in {formatDuration(closesAt - now)}</span>
            </>
          )}
          {phase === "confirming" && (
            <>
              {clock(closesAt)} <span className="muted">· equal split allowed in {formatDuration(fallbackAt - now)}</span>
            </>
          )}
          {phase === "fallback" && (
            <>
              {clock(closesAt)} <span className="muted">· time to agree has passed</span>
            </>
          )}
          {phase === "settled" && (
            <>
              {clock(shift.settledAt.toNumber())} <span className="muted">· {shift.byTimeout ? "equal split" : "split by confirmed hours"}</span>
            </>
          )}
        </Prop>
        <Prop icon="coins" label={shift.settled ? "Paid to staff" : "In the vault"}>
          <b>{fromUnits(pool)} USDC</b>
          <span className="muted">
            {" "}
            · {shift.tipCount} tip{shift.tipCount === 1 ? "" : "s"}
          </span>
        </Prop>
        <Prop icon="lock" label="Vault">
          <ExtLink href={explorerAddr(vaultOf(key))}>{short(vaultOf(key))}</ExtLink>
          <span className="muted"> · only the program can move this money</span>
        </Prop>
        <OwnerProp shift={shift} />
      </Properties>

      <PayoutBanner shiftKey={key} shift={shift} now={now} />

      <div className="section-head">
        <h2>Team</h2>
        <span className={`meter ${majority ? "ok" : ""}`}>
          <span className="meter-bar">
            <span style={{ width: `${Math.min(100, (confirmations(shift) / needed(shift)) * 100)}%` }} />
          </span>
          {confirmations(shift)} of {shift.staff.length} agreed · {needed(shift)} needed
        </span>
      </div>
      <Team shift={shift} shares={shares} phase={phase} />
      {!shift.settled && (
        <p className="muted small">
          {equal ? "Split equally, because no majority agreed in time." : "Split by the hours each person entered."} Any change to
          someone's hours resets everyone's agreement.
        </p>
      )}

      {!shift.settled && <YourPart shiftKey={key} shift={shift} phase={phase} pool={pool} />}

      {!shift.settled && <TipLink shiftKey={key} />}

      <ActivityFeed shiftKey={key} />
    </article>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <article className="doc">
      <Callout icon="alert">{text}</Callout>
    </article>
  );
}

function OwnerProp({ shift }: { shift: ShiftAccount }) {
  const { connection } = useConnection();
  const { tick } = useTx();
  const [bal, setBal] = useState<bigint | null>(null);
  useInterval(() => tokenBalance(connection, ata(shift.owner)).then(setBal), 20000, [shift.owner.toBase58(), tick]);
  return (
    <Prop icon="user" label="Owner">
      <ExtLink href={explorerAddr(shift.owner)}>{short(shift.owner)}</ExtLink>
      <span className="muted"> · holds {bal === null ? "…" : fromUnits(bal)} USDC, no access to the vault</span>
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
      <Callout icon="check" tone="green">
        <b>Paid out.</b> The vault was emptied straight into each person's wallet and then closed. The owner never held this money.
      </Callout>
    );
  if (!canSettle(shift, now)) return null;
  return (
    <div className="banner">
      <div>
        <b>{hasMajority(shift) ? "Ready to pay out, split by hours" : "Ready to pay out, split equally"}</b>
        <p className="muted small">Anyone can press this, including {active.name}. The program decides who gets what.</p>
      </div>
      <button className="btn primary" disabled={!!pending || !active.publicKey} onClick={payout}>
        Pay out now
      </button>
    </div>
  );
}

function Team({ shift, shares, phase }: { shift: ShiftAccount; shares: bigint[]; phase: string }) {
  const { active } = useActors();
  return (
    <table className="db">
      <thead>
        <tr>
          <th>Name</th>
          <th>Hours</th>
          <th>Agreed</th>
          <th className="num">{shift.settled ? "Paid" : phase === "open" ? "Share so far" : "Will get"}</th>
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
                  <Avatar name={s.name} seed={s.wallet.toBase58()} />
                  {s.name}
                  {me && <span className="you">you</span>}
                  <ExtLink href={explorerAddr(s.wallet)}>
                    <span className="mono muted">{short(s.wallet)}</span>
                  </ExtLink>
                </span>
              </td>
              <td>{s.submitted ? hm(s.minutes) : <span className="muted">Not entered</span>}</td>
              <td>
                {agreed ? (
                  <Tag tone="green">
                    <Icon name="check" size={12} /> Agreed
                  </Tag>
                ) : s.confirmedVersion > 0 ? (
                  <Tag tone="yellow">Needs to re-check</Tag>
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
  );
}

function YourPart({ shiftKey, shift, phase, pool }: { shiftKey: PublicKey; shift: ShiftAccount; phase: string; pool: bigint }) {
  const { active } = useActors();
  const entry = shift.staff.find((s) => active.publicKey && s.wallet.equals(active.publicKey));
  const isOwner = !!active.publicKey?.equals(shift.owner);
  return (
    <>
      <h2>Your part</h2>
      <p className="muted small">
        Signing as <b>{active.name}</b>. Switch in the sidebar to act as someone else.
      </p>
      {entry && <StaffPart shiftKey={shiftKey} shift={shift} phase={phase} me={active} />}
      {isOwner && <OwnerPart shiftKey={shiftKey} shift={shift} phase={phase} pool={pool} />}
      {!entry && !isOwner && (
        <p>
          {active.name} isn't on this team, so they can tip or press <b>Pay out</b> when it's ready, and nothing else.
        </p>
      )}
    </>
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
    <div className="panel">
      <div className="step-row">
        <span className={`step-num ${entry.submitted ? "done" : ""}`}>{entry.submitted ? <Icon name="check" size={12} /> : "1"}</span>
        <div className="step-body">
          <div className="step-title">Enter the hours you worked</div>
          <div className="row gap">
            <input className="hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, ""))} />
            <span className="muted">hours</span>
            <button
              className="btn small"
              disabled={invalid || unchanged || !!pending}
              onClick={() => run("Save hours", async () => send(txOf(await ixSubmitHours(program, me.publicKey!, shiftKey, minutes))))}
            >
              {entry.submitted ? "Update" : "Save"}
            </button>
            {tooMany && <em className="field-err">The shift was only {hm(shift.scheduledMinutes)}</em>}
          </div>
        </div>
      </div>
      <div className="step-row">
        <span className={`step-num ${agreed ? "done" : ""}`}>{agreed ? <Icon name="check" size={12} /> : "2"}</span>
        <div className="step-body">
          <div className="step-title">Agree with everyone's hours</div>
          <p className="muted small">
            {phase === "open"
              ? "Available once the shift is over."
              : agreed
                ? "You agreed. If anyone changes their hours, you'll be asked again."
                : "Check the team table above. You're agreeing to these exact numbers."}
          </p>
          <button
            className="btn primary small"
            disabled={phase === "open" || agreed || !!pending}
            onClick={() => run("Agree", async () => send(txOf(await ixConfirm(program, me.publicKey!, shiftKey, shift.version))))}
          >
            {agreed ? "Agreed" : "I agree"}
          </button>
        </div>
      </div>
    </div>
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
    <div className="panel">
      {phase === "open" && (
        <>
          <div className="row gap between">
            <div>
              <div className="step-title">End the shift now</div>
              <p className="muted small">Moves the end time earlier. Tips can still come in until payout.</p>
            </div>
            <button className="btn small" disabled={!!pending} onClick={() => run("End shift", async () => send(txOf(await ixEndShift(program, owner, shiftKey))))}>
              End shift
            </button>
          </div>
          <div className="divider" />
          <div className="step-title">Add someone covering</div>
          <div className="row gap add-row">
            <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="mono grow" placeholder="Wallet address" value={wallet} onChange={(e) => setWallet(e.target.value)} />
            <button
              className="btn small"
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
          {addErr && <em className="field-err">{addErr}</em>}
          <div className="divider" />
        </>
      )}
      <details className="toggle">
        <summary>
          <Icon name="chevronRight" size={14} className="toggle-caret" />
          <Icon name="shield" size={15} /> Try to take the tips (security test)
        </summary>
        <div className="toggle-body">
          <p className="muted small">
            These send real transactions as the owner. They skip the wallet's safety check so they reach devnet and fail there. Open
            the transaction from the notification to see the error on Explorer.
          </p>
          <div className="row gap">
            <button className="btn danger small" disabled={!!pending} onClick={rawWithdraw}>
              Withdraw {fromUnits(pool)} USDC from the vault
            </button>
            <button className="btn danger small" disabled={!!pending} onClick={redirect}>
              Send {shift.staff[0]?.name}'s share to me
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}

function TipLink({ shiftKey }: { shiftKey: PublicKey }) {
  const url = `${window.location.origin}${window.location.pathname}#/tip/${shiftKey.toBase58()}`;
  const [src, setSrc] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: "#191919", light: "#ffffff" } }).then(setSrc);
  }, [url]);
  return (
    <>
      <h2>Tip link</h2>
      <div className="qr-block">
        {src && <img src={src} alt="QR code for the guest tip page" />}
        <div>
          <p>Print this on the bill or put it on the table. Guests open it on their phone and tip in two taps.</p>
          <div className="row gap">
            <a className="btn small" href={`#/tip/${shiftKey.toBase58()}`}>
              Open tip page
            </a>
            <button
              className="btn ghost small"
              onClick={() => {
                navigator.clipboard?.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      </div>
    </>
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
    <>
      <h2>Activity</h2>
      {items === null ? (
        <p className="muted small">Loading from devnet…</p>
      ) : (
        <ul className="feed">
          {items.map((a) => (
            <li key={a.signature}>
              <span className={`feed-dot ${a.err ? "err" : ""}`} />
              <span className="feed-text">
                {a.action}
                {a.err && <Tag tone="red">Blocked</Tag>}
              </span>
              <span className="muted small mono">{short(a.signer)}</span>
              <span className="muted small">{a.time ? clock(a.time) : ""}</span>
              <a className="muted" href={explorerTx(a.signature)} target="_blank" rel="noreferrer" aria-label="View on Explorer">
                <Icon name="external" size={13} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
