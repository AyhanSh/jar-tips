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

export const toUnits = (amount: number) => new BN(Math.round(amount * 10 ** DECIMALS));
export const fromUnits = (v: BN | bigint | number) =>
  (Number(v.toString()) / 10 ** DECIMALS).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export async function tokenBalance(connection: Connection, account: PublicKey): Promise<bigint> {
  try {
    const b = await connection.getTokenAccountBalance(account);
    return BigInt(b.value.amount);
  } catch {
    return 0n;
  }
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
  const ix = await p.methods
    .openShift(label, minutes, staff)
    .accountsPartial({ owner, venue, mint: TIP_MINT, shift, vault: vaultOf(shift), tokenProgram: TOKEN_PROGRAM })
    .instruction();
  // Staff token accounts are created up front (owner pays a little rent) so payouts never fail.
  const atas = staff.map((s) =>
    createAssociatedTokenAccountIdempotentInstruction(owner, ata(s.wallet), s.wallet, TIP_MINT),
  );
  return { ixs: [...atas, ix], shift };
}

export async function ixAddStaff(p: NapiwekProgram, owner: PublicKey, shift: PublicKey, wallet: PublicKey, name: string) {
  return [
    createAssociatedTokenAccountIdempotentInstruction(owner, ata(wallet), wallet, TIP_MINT),
    await p.methods.addStaff(wallet, name).accountsPartial({ owner, shift }).instruction(),
  ];
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
  // If a staff member closed their token account, recreate it so the payout can't be blocked.
  const atas = shift.staff.map((s) =>
    createAssociatedTokenAccountIdempotentInstruction(caller, ata(s.wallet), s.wallet, TIP_MINT),
  );
  const ix = await p.methods
    .settle()
    .accountsPartial({ caller, shift: shiftKey, owner: shift.owner, mint: TIP_MINT, vault: vaultOf(shiftKey), tokenProgram: TOKEN_PROGRAM })
    .remainingAccounts(targets.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })))
    .instruction();
  return payTo ? [ix] : [...atas, ix];
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
  OpenShift: "Shift opened, vault created",
  AddStaff: "Staff added",
  EndShift: "Shift ended",
  Tip: "Tip received",
  SubmitHours: "Hours submitted",
  Confirm: "Hours confirmed",
  Settle: "Tips paid out",
  TransferChecked: "Direct withdrawal attempt",
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
    if (/owner does not match/.test(all)) action = "Direct withdrawal attempt";
    else if (/WrongPayoutAccount/.test(all)) action = "Payout redirect attempt";
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
