// End-to-end smoke test against the deployed devnet program.
// Plays every role with fresh keypairs funded from ~/.config/solana/id.json:
//   owner opens a shift for Ana, Ben, Kasia -> a guest tips twice
//   owner tries to take the tips (two ways) -> both rejected on-chain
//   staff submit 8h / 6h / 4h -> Ana + Ben confirm (2 of 3) -> a STRANGER settles
//
//   npx tsx scripts/e2e-devnet.ts [--timeout]   (--timeout: nobody confirms, equal split after the window)

import { AnchorProvider, BN, Program, Wallet } from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  mintTo,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import idl from "../src/idl/napiwek.json" with { type: "json" };
import type { Napiwek } from "../src/idl/napiwek";
import devnet from "../src/devnet.json" with { type: "json" };

const RPC = process.env.RPC_URL ?? clusterApiUrl("devnet");
const WINDOW = 60; // seconds staff get to confirm before the equal split is allowed
const load = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
const explorer = (s: string) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) =>
  (e as { error?: { errorMessage?: string } }).error?.errorMessage ?? (e as Error).message.split("\n")[0];

async function main() {
  const timeoutPath = process.argv.includes("--timeout");
  const connection = new Connection(RPC, "confirmed");
  const funder = load(join(homedir(), ".config/solana/id.json"));
  const faucet = load(join(import.meta.dirname, "..", "src", "faucet-keypair.json"));
  const mint = new PublicKey(devnet.testUsdcMint);
  const programId = new PublicKey(idl.address);
  const [owner, ana, ben, kasia, guest, stranger] = Array.from({ length: 6 }, () => Keypair.generate());
  const staff = [
    { kp: ana, name: "Ana", minutes: 480 },
    { kp: ben, name: "Ben", minutes: 360 },
    { kp: kasia, name: "Kasia", minutes: 240 },
  ];
  const ataOf = (o: PublicKey) => getAssociatedTokenAddressSync(mint, o, true);

  // fund SOL for fees + rent, create everyone's token account, give the guest 100 tUSDC
  const fund = new Transaction();
  fund.add(SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: owner.publicKey, lamports: 0.03 * LAMPORTS_PER_SOL }));
  for (const k of [ana, ben, kasia, guest, stranger])
    fund.add(SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: k.publicKey, lamports: 0.005 * LAMPORTS_PER_SOL }));
  for (const k of [owner, ana, ben, kasia, guest])
    fund.add(createAssociatedTokenAccountIdempotentInstruction(funder.publicKey, ataOf(k.publicKey), k.publicKey, mint));
  await sendAndConfirmTransaction(connection, fund, [funder]);
  await mintTo(connection, funder, mint, ataOf(guest.publicKey), faucet, 100e6);
  console.log("owner", owner.publicKey.toBase58());

  const programFor = (k: Keypair) =>
    new Program<Napiwek>(idl as Napiwek, new AnchorProvider(connection, new Wallet(k), { commitment: "confirmed" }));
  const [venue] = PublicKey.findProgramAddressSync([Buffer.from("venue"), owner.publicKey.toBuffer()], programId);
  const [shift] = PublicKey.findProgramAddressSync(
    [Buffer.from("shift"), venue.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)],
    programId,
  );
  const vault = ataOf(shift);

  let sig = await programFor(owner)
    .methods.createVenue("Bistro Wisła", new BN(WINDOW))
    .accountsPartial({ owner: owner.publicKey, mint, venue, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  console.log("1. venue created               ", explorer(sig));

  sig = await programFor(owner)
    .methods.openShift(
      "Friday dinner",
      480,
      staff.map((s) => ({ wallet: s.kp.publicKey, name: s.name })),
    )
    .accountsPartial({ owner: owner.publicKey, venue, mint, shift, vault, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  console.log("2. shift opened (vault = PDA)  ", explorer(sig));

  for (const amount of [40e6, 25e6]) {
    sig = await programFor(guest)
      .methods.tip(new BN(amount))
      .accountsPartial({ tipper: guest.publicKey, shift, mint, tipperToken: ataOf(guest.publicKey), vault, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
    console.log(`3. guest tipped ${amount / 1e6} tUSDC         `, explorer(sig));
  }

  // --- the owner tries to take the money ---
  try {
    const raw = new Transaction().add(
      createTransferCheckedInstruction(vault, mint, ataOf(owner.publicKey), owner.publicKey, 65e6, 6),
    );
    await sendAndConfirmTransaction(connection, raw, [owner]);
    throw new Error("owner withdrawal should have failed");
  } catch (e) {
    console.log("4. owner raw withdraw REJECTED:", errMsg(e).slice(0, 90));
  }
  try {
    await programFor(owner)
      .methods.settle()
      .accountsPartial({ caller: owner.publicKey, shift, owner: owner.publicKey, mint, vault, tokenProgram: TOKEN_PROGRAM_ID })
      .remainingAccounts([owner, ben, kasia].map((k) => ({ pubkey: ataOf(k.publicKey), isSigner: false, isWritable: true })))
      .rpc();
    throw new Error("redirected settle should have failed");
  } catch (e) {
    console.log("5. owner redirect REJECTED:    ", errMsg(e));
  }
  try {
    await programFor(owner).methods.submitHours(480).accountsPartial({ staff: owner.publicKey, shift }).rpc();
    throw new Error("owner hours should have failed");
  } catch (e) {
    console.log("6. owner hours REJECTED:       ", errMsg(e));
  }

  sig = await programFor(owner).methods.endShift().accountsPartial({ owner: owner.publicKey, shift }).rpc();
  console.log("7. owner ended shift           ", explorer(sig));

  if (!timeoutPath) {
    for (const s of staff) {
      sig = await programFor(s.kp).methods.submitHours(s.minutes).accountsPartial({ staff: s.kp.publicKey, shift }).rpc();
      console.log(`8. ${s.name.padEnd(5)} submitted ${s.minutes / 60}h       `, explorer(sig));
    }
    const { version } = await programFor(stranger).account.shift.fetch(shift);
    for (const s of staff.slice(0, 2)) {
      sig = await programFor(s.kp).methods.confirm(version).accountsPartial({ staff: s.kp.publicKey, shift }).rpc();
      console.log(`9. ${s.name.padEnd(5)} confirmed v${version}         `, explorer(sig));
    }
  } else {
    console.log(`   nobody confirms… waiting ${WINDOW + 5}s for the window`);
    await sleep((WINDOW + 5) * 1000);
  }

  sig = await programFor(stranger)
    .methods.settle()
    .accountsPartial({ caller: stranger.publicKey, shift, owner: owner.publicKey, mint, vault, tokenProgram: TOKEN_PROGRAM_ID })
    .remainingAccounts(staff.map((s) => ({ pubkey: ataOf(s.kp.publicKey), isSigner: false, isWritable: true })))
    .rpc();
  console.log("10. STRANGER settled           ", explorer(sig));

  for (const s of [...staff.map((x) => ({ kp: x.kp, name: x.name })), { kp: owner, name: "OWNER" }]) {
    const b = await connection.getTokenAccountBalance(ataOf(s.kp.publicKey));
    console.log(`   ${s.name.padEnd(6)} ${b.value.uiAmountString} tUSDC`);
  }
  console.log(`\nView in app: http://localhost:5174/#/shift/${shift.toBase58()}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
  console.error(e);
  process.exit(1);
});
