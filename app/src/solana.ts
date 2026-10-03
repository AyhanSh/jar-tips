import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
  type ConfirmedSignatureInfo,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import idl from "./idl/napiwek.json";
import type { Napiwek } from "./idl/napiwek";
import devnet from "./devnet.json";
import faucetSecret from "./faucet-keypair.json";

export const RPC_URL: string = import.meta.env.VITE_RPC_URL || clusterApiUrl("devnet");
/**
 * Where QR codes point. Set VITE_PUBLIC_URL to the deployed site when presenting from localhost,
 * so a phone scanning the QR opens the public app instead of the laptop's localhost.
 */
export const PUBLIC_URL: string = (import.meta.env.VITE_PUBLIC_URL || window.location.origin + window.location.pathname).replace(/\/+$/, "");
export const tipUrl = (shift: PublicKey | string) => `${PUBLIC_URL}/#/tip/${shift.toString()}`;
export const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
/** Opens a page inside a mobile wallet's built-in browser, where the wallet can sign. */
export const walletBrowseLinks = (url: string) => ({
  phantom: `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(PUBLIC_URL)}`,
  solflare: `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(PUBLIC_URL)}`,
});
export const PROGRAM_ID = new PublicKey(idl.address);
export const TIP_MINT = new PublicKey(devnet.testUsdcMint);
export const DECIMALS = 6;
/** The demo mint is a classic SPL token; the program also accepts Token-2022 mints. */
export const TOKEN_PROGRAM = TOKEN_PROGRAM_ID;
export const SYMBOL = "USDC";

export type NapiwekProgram = Program<Napiwek>;
export type ShiftAccount = Awaited<ReturnType<NapiwekProgram["account"]["shift"]["fetch"]>>;
export type VenueAccount = Awaited<ReturnType<NapiwekProgram["account"]["venue"]["fetch"]>>;
export type StaffEntry = ShiftAccount["staff"][number];

// The program is only used to build instructions and read accounts; signing is
// done by whichever "actor" is active (browser wallet or a demo keypair).
export function getProgram(connection: Connection): NapiwekProgram {
  return new Program<Napiwek>(idl as Napiwek, { connection } as AnchorProvider);
}

export const venuePda = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("venue"), owner.toBuffer()], PROGRAM_ID)[0];

export const shiftPda = (venue: PublicKey, index: number | BN) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("shift"), venue.toBuffer(), new BN(index).toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  )[0];

export const ata = (owner: PublicKey) => getAssociatedTokenAddressSync(TIP_MINT, owner, true);
export const vaultOf = (shift: PublicKey) => ata(shift);

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddr = (a: PublicKey | string) =>
  `https://explorer.solana.com/address/${a.toString()}?cluster=devnet`;

export const short = (a: PublicKey | string, n = 4) => {
  const s = a.toString();
  return `${s.slice(0, n)}…${s.slice(-n)}`;
};

export const MAX_STAFF = 12;
export const MAX_NAME_BYTES = 32;
export const MAX_STAFF_NAME_BYTES = 16;
/** The program limits names in bytes, not characters ("ł" is two bytes). */
export const byteLen = (s: string) => new TextEncoder().encode(s).length;

export function parseKey(s: string): PublicKey | null {
  try {
    return new PublicKey(s.trim());
  } catch {
    return null;
  }
}

export const toUnits = (amount: number) => new BN(Math.round(amount * 10 ** DECIMALS));
export const fromUnits = (v: BN | bigint | number) =>
  (Number(v.toString()) / 10 ** DECIMALS).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** 0 when the token account doesn't exist; throws on RPC errors so pollers keep the last good value. */
export async function tokenBalance(connection: Connection, account: PublicKey): Promise<bigint> {
  const info = await connection.getAccountInfo(account);
  // SPL token account layout: amount is a u64 at byte 64.
  return info && info.data.length >= 72 ? info.data.readBigUInt64LE(64) : 0n;
}

/** SOL and tip-token balances for many wallets in two RPC calls (public devnet RPC is rate-limited). */
export async function balancesOf(connection: Connection, owners: PublicKey[]): Promise<{ sol: number; usdc: bigint }[]> {
  const [wallets, tokens] = await Promise.all([
    connection.getMultipleAccountsInfo(owners),
    connection.getMultipleAccountsInfo(owners.map(ata)),
  ]);
  return owners.map((_, i) => ({
    sol: (wallets[i]?.lamports ?? 0) / 1e9,
    // SPL token account layout: amount is a u64 at byte 64.
    usdc: tokens[i] ? tokens[i]!.data.readBigUInt64LE(64) : 0n,
  }));
}

// ---------------------------------------------------------------------------
// shift maths, mirrored from the program so the UI can preview the split
// ---------------------------------------------------------------------------

export function confirmations(shift: ShiftAccount): number {
  return shift.staff.filter((s) => s.confirmedVersion === shift.version).length;
}

export type Phase = "open" | "confirming" | "fallback" | "settled";

export function phaseOf(shift: ShiftAccount, now: number): Phase {
  if (shift.settled) return "settled";
  if (now < shift.closesAt.toNumber()) return "open";
  if (now < shift.closesAt.toNumber() + shift.confirmWindow.toNumber()) return "confirming";
  return "fallback";
}

export const hasMajority = (shift: ShiftAccount) => confirmations(shift) * 2 > shift.staff.length;
export const needed = (shift: ShiftAccount) => Math.floor(shift.staff.length / 2) + 1;

/** Can `settle` succeed right now? Mirrors the checks at the top of `settle` in lib.rs. */
export const canSettle = (shift: ShiftAccount, now: number) => {
  const phase = phaseOf(shift, now);
  return (phase !== "open" && phase !== "settled" && hasMajority(shift)) || phase === "fallback";
};

/**
 * Where a shift is in its life: 1 collecting tips, 2 waiting for hours, 3 waiting for agreement,
 * 4 ready to pay out, 5 paid out.
 */
export function stageOf(shift: ShiftAccount, now: number): 1 | 2 | 3 | 4 | 5 {
  if (shift.settled) return 5;
  if (phaseOf(shift, now) === "open") return 1;
  if (canSettle(shift, now)) return 4;
  return shift.staff.some((s) => !s.submitted) ? 2 : 3;
}

/** One human status for a shift, used in lists and on the shift page. */
export function statusOf(shift: ShiftAccount, now: number): { label: string; tone: "gray" | "blue" | "green" | "orange" | "yellow" } {
  const phase = phaseOf(shift, now);
  if (phase === "settled") return { label: "Paid out", tone: "green" };
  if (phase === "open") return { label: "Open for tips", tone: "blue" };
  if (hasMajority(shift)) return { label: "Ready to pay out", tone: "orange" };
  if (phase === "fallback") return { label: "Ready: equal split", tone: "orange" };
  return { label: "Confirming hours", tone: "yellow" };
}

/** Same rule as `split` in lib.rs: floor pro-rata, dust to the heaviest weight. */
export function split(pool: bigint, weights: bigint[]): bigint[] {
  const total = weights.reduce((a, b) => a + b, 0n);
  if (total === 0n) return weights.map(() => 0n);
  const shares = weights.map((w) => (pool * w) / total);
  const dust = pool - shares.reduce((a, b) => a + b, 0n);
  let top = 0;
  weights.forEach((w, i) => {
    if (w > weights[top]) top = i;
  });
  shares[top] += dust;
  return shares;
}

/** What each person would get if the shift settled right now. */
export function previewShares(shift: ShiftAccount, pool: bigint, byTimeout: boolean): bigint[] {
  const minutes = shift.staff.map((s) => BigInt(s.minutes));
  const total = minutes.reduce((a, b) => a + b, 0n);
  const weights = !byTimeout && total > 0n ? minutes : shift.staff.map(() => 1n);
  return split(pool, weights);
}

// ---------------------------------------------------------------------------
// instruction builders
// ---------------------------------------------------------------------------

export async function ixCreateVenue(p: NapiwekProgram, owner: PublicKey, name: string, window: number) {
  return p.methods
    .createVenue(name, new BN(window))
    .accountsPartial({ owner, mint: TIP_MINT, venue: venuePda(owner), tokenProgram: TOKEN_PROGRAM })
    .instruction();
}

export async function ixOpenShift(
  p: NapiwekProgram,
  owner: PublicKey,
  index: number,
  label: string,
  minutes: number,
  staff: { wallet: PublicKey; name: string }[],
) {
  const venue = venuePda(owner);
  const shift = shiftPda(venue, index);
  // Staff token accounts are not created here: with a full roster that would not fit in one
  // transaction. Whoever pays out creates any missing ones first (see missingAtaIxs).
  const ix = await p.methods
    .openShift(label, minutes, staff)
    .accountsPartial({ owner, venue, mint: TIP_MINT, shift, vault: vaultOf(shift), tokenProgram: TOKEN_PROGRAM })
    .instruction();
  return { ix, shift };
}

export async function ixAddStaff(p: NapiwekProgram, owner: PublicKey, shift: PublicKey, wallet: PublicKey, name: string) {
  return p.methods.addStaff(wallet, name).accountsPartial({ owner, shift }).instruction();
}

export async function ixEndShift(p: NapiwekProgram, owner: PublicKey, shift: PublicKey) {
  return p.methods.endShift().accountsPartial({ owner, shift }).instruction();
}

export async function ixTip(p: NapiwekProgram, tipper: PublicKey, shift: PublicKey, amount: BN) {
  return p.methods
    .tip(amount)
    .accountsPartial({ tipper, shift, mint: TIP_MINT, tipperToken: ata(tipper), vault: vaultOf(shift), tokenProgram: TOKEN_PROGRAM })
    .instruction();
}

export async function ixSubmitHours(p: NapiwekProgram, staff: PublicKey, shift: PublicKey, minutes: number) {
  return p.methods.submitHours(minutes).accountsPartial({ staff, shift }).instruction();
}

export async function ixConfirm(p: NapiwekProgram, staff: PublicKey, shift: PublicKey, version: number) {
  return p.methods.confirm(version).accountsPartial({ staff, shift }).instruction();
}

/** `payTo` defaults to the roster's own token accounts; overriding it is how the owner "attack" is staged. */
export async function ixSettle(
  p: NapiwekProgram,
  caller: PublicKey,
  shiftKey: PublicKey,
  shift: ShiftAccount,
  payTo?: PublicKey[],
) {
  const targets = payTo ?? shift.staff.map((s) => ata(s.wallet));
  return p.methods
    .settle()
    .accountsPartial({ caller, shift: shiftKey, owner: shift.owner, mint: TIP_MINT, vault: vaultOf(shiftKey), tokenProgram: TOKEN_PROGRAM })
    .remainingAccounts(targets.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })))
    .instruction();
}

/**
 * Create-account instructions for any staff token account that doesn't exist yet (never
 * opened, or closed by its owner), in chunks small enough for one transaction each.
 * Run before `settle` so a missing account can never block the payout.
 */
export async function missingAtaIxs(connection: Connection, payer: PublicKey, wallets: PublicKey[]) {
  const infos = await connection.getMultipleAccountsInfo(wallets.map(ata));
  const ixs = wallets
    .filter((_, i) => !infos[i])
    .map((w) => createAssociatedTokenAccountIdempotentInstruction(payer, ata(w), w, TIP_MINT));
  const chunks: TransactionInstruction[][] = [];
  for (let i = 0; i < ixs.length; i += 4) chunks.push(ixs.slice(i, i + 4));
  return chunks;
}

/** The owner tries to move tips out of the vault directly with the Token program. */
export function ixOwnerRawWithdraw(owner: PublicKey, shift: PublicKey, amount: bigint) {
  return [
    createAssociatedTokenAccountIdempotentInstruction(owner, ata(owner), owner, TIP_MINT),
    createTransferCheckedInstruction(vaultOf(shift), TIP_MINT, ata(owner), owner, amount, DECIMALS),
  ];
}

/** Devnet-only faucet for the demo token. The bundled faucet key co-signs the mint. */
export function faucetIxs(payer: PublicKey, user: PublicKey, amount: bigint): { ixs: TransactionInstruction[]; faucet: Keypair } {
  const faucet = Keypair.fromSecretKey(Uint8Array.from(faucetSecret as number[]));
  return {
    faucet,
    ixs: [
      createAssociatedTokenAccountIdempotentInstruction(payer, ata(user), user, TIP_MINT, undefined, ASSOCIATED_TOKEN_PROGRAM_ID),
      createMintToInstruction(TIP_MINT, ata(user), faucet.publicKey, amount),
    ],
  };
}

export const txOf = (...ixs: TransactionInstruction[]) => new Transaction().add(...ixs);

// ---------------------------------------------------------------------------
// misc
// ---------------------------------------------------------------------------

/** Rough chain-clock offset so countdowns match what the program will see. */
export async function chainClockOffset(connection: Connection): Promise<number> {
  try {
    const slot = await connection.getSlot("confirmed");
    const t = await connection.getBlockTime(slot);
    return t ? t - Date.now() / 1000 : 0;
  } catch {
    return 0;
  }
}

export interface Activity {
  signature: string;
  time: number | null;
  action: string;
  signer: string;
  err: boolean;
}

const IX_LABELS: Record<string, string> = {
  OpenShift: "Shift opened",
  AddStaff: "Person added",
  EndShift: "Shift ended",
  Tip: "Tip received",
  SubmitHours: "Hours entered",
  Confirm: "Agreed to hours",
  Settle: "Paid out",
  TransferChecked: "Owner tried to withdraw",
};

// Transactions are immutable, so each one is fetched once and cached.
const txCache = new Map<string, { action: string; signer: string }>();

export async function loadActivity(connection: Connection, address: PublicKey): Promise<Activity[]> {
  const sigs: ConfirmedSignatureInfo[] = await connection.getSignaturesForAddress(address, { limit: 10 });
  for (const s of sigs) {
    if (txCache.has(s.signature)) continue;
    await new Promise((r) => setTimeout(r, 300)); // spread lookups out; public RPC rate-limits bursts
    const tx = await connection.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (!tx) continue;
    const logs = tx.meta?.logMessages ?? [];
    const ix = logs.map((l) => /Program log: Instruction: (\w+)/.exec(l)?.[1]).find((n) => n && IX_LABELS[n]);
    const all = logs.join("\n");
    let action = ix ? IX_LABELS[ix] : "Transaction";
    if (/owner does not match/.test(all)) action = "Owner tried to withdraw";
    else if (/WrongPayoutAccount/.test(all)) action = "Someone tried to redirect a share";
    else if (tx.meta?.err && ix === "Settle") action = "Payout attempt";
    txCache.set(s.signature, {
      action,
      signer: tx.transaction.message.staticAccountKeys[0]?.toBase58() ?? "",
    });
  }
  return sigs.map((s) => ({
    signature: s.signature,
    time: s.blockTime ?? null,
    action: txCache.get(s.signature)?.action ?? "…",
    signer: txCache.get(s.signature)?.signer ?? "",
    err: !!s.err,
  }));
}

export function errorMessage(e: unknown): string {
  const any = e as { error?: { errorMessage?: string }; errorMessage?: string; message?: string; logs?: string[] };
  if (any?.error?.errorMessage) return any.error.errorMessage;
  if (any?.errorMessage) return any.errorMessage;
  const msg = any?.message ?? (typeof e === "object" ? JSON.stringify(e) : String(e));
  const m = /Error Message: ([^.]+)/.exec(msg);
  return m ? m[1] : msg;
}

/** Turns an on-chain failure's logs into one human sentence. */
export function explainFailure(logs: string[] | null | undefined): string {
  const l = (logs ?? []).join("\n");
  const anchor = /Error Message: ([^.\n]+)/.exec(l);
  if (anchor) return anchor[1];
  if (/owner does not match/i.test(l)) return "Token program: owner does not match (the vault belongs to the program, not to you)";
  const custom = /failed: (.+)$/m.exec(l);
  return custom ? custom[1] : "Transaction failed on-chain";
}
