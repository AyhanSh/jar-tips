// End-to-end smoke test against the deployed program (or a local validator with RPC_URL).
// Plays every role with fresh keypairs funded from ~/.config/solana/id.json. There is no owner:
//   Ana starts a team with Ben and Kasia -> adding / removing a coworker needs a majority
//   an outsider (say, the restaurant) can't open shifts, vote, join, withdraw or redirect
//   Ben opens a shift for Ana and himself -> Kasia joins herself -> a guest tips twice
//   hours 8h / 6h / 4h -> Ana + Ben confirm (2 of 3) -> a STRANGER settles
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
  const [ana, ben, kasia, ola, guest, outsider, stranger] = Array.from({ length: 7 }, () => Keypair.generate());
  const crew = [
    { kp: ana, name: "Ana", minutes: 480 },
    { kp: ben, name: "Ben", minutes: 360 },
    { kp: kasia, name: "Kasia", minutes: 240 },
  ];
  const ataOf = (o: PublicKey) => getAssociatedTokenAddressSync(mint, o, true);

  // fund SOL for fees + rent, create everyone's token account, give the guest 100 tUSDC
  const fund = new Transaction();
  for (const k of [ana, ben])
    fund.add(SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: k.publicKey, lamports: 0.03 * LAMPORTS_PER_SOL }));
  for (const k of [kasia, ola, guest, outsider, stranger])
    fund.add(SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: k.publicKey, lamports: 0.005 * LAMPORTS_PER_SOL }));
  for (const k of [ana, ben, kasia, guest, outsider])
    fund.add(createAssociatedTokenAccountIdempotentInstruction(funder.publicKey, ataOf(k.publicKey), k.publicKey, mint));
  await sendAndConfirmTransaction(connection, fund, [funder]);
  await mintTo(connection, funder, mint, ataOf(guest.publicKey), faucet, 100e6);

  const programFor = (k: Keypair) =>
    new Program<Napiwek>(idl as Napiwek, new AnchorProvider(connection, new Wallet(k), { commitment: "confirmed" }));
  const [team] = PublicKey.findProgramAddressSync([Buffer.from("team"), ana.publicKey.toBuffer()], programId);
  const [shift] = PublicKey.findProgramAddressSync(
    [Buffer.from("shift"), team.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)],
    programId,
  );
  const vault = ataOf(shift);
  const expectFail = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      return console.log(`   ✗ ${label.padEnd(34)} REJECTED: ${errMsg(e).slice(0, 80)}`);
    }
    throw new Error(`${label} should have failed`);
  };
  const members = async () => (await programFor(stranger).account.team.fetch(team)).members.map((m) => m.name).join(", ");

  // --- 1. the team runs itself ---
  let sig = await programFor(ana)
    .methods.createTeam("Bistro Wisła", new BN(WINDOW), crew.map((s) => ({ wallet: s.kp.publicKey, name: s.name })))
    .accountsPartial({ creator: ana.publicKey, mint, team, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  console.log("1. Ana started the team        ", explorer(sig), `[${await members()}]`);

  await programFor(ana).methods.propose(true, ola.publicKey, "Ola").accountsPartial({ member: ana.publicKey, team }).rpc();
  console.log(`2. Ana proposes adding Ola      1 of 3 votes, team still [${await members()}]`);
  await expectFail("outsider votes", () =>
    programFor(outsider).methods.vote(1).accountsPartial({ member: outsider.publicKey, team }).rpc(),
  );
  await programFor(ben).methods.vote(1).accountsPartial({ member: ben.publicKey, team }).rpc();
  console.log(`   Ben approves                 2 of 3 -> passed, team [${await members()}]`);

  await programFor(kasia).methods.propose(false, ola.publicKey, "").accountsPartial({ member: kasia.publicKey, team }).rpc();
  await programFor(ana).methods.vote(2).accountsPartial({ member: ana.publicKey, team }).rpc();
  console.log(`3. Kasia proposes removing Ola  2 of 4, team still [${await members()}]`);
  await programFor(ben).methods.vote(2).accountsPartial({ member: ben.publicKey, team }).rpc();
  console.log(`   Ben approves                 3 of 4 -> passed, team [${await members()}]`);

  // --- 2. a shift ---
  await expectFail("outsider opens a shift", () =>
    programFor(outsider)
      .methods.openShift("Fake shift", 480, [outsider.publicKey])
      .accountsPartial({ opener: outsider.publicKey, team, mint, shift, vault, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc(),
  );
  await expectFail("Ben lists an outsider", () =>
    programFor(ben)
      .methods.openShift("Friday dinner", 480, [ben.publicKey, outsider.publicKey])
      .accountsPartial({ opener: ben.publicKey, team, mint, shift, vault, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc(),
  );
  sig = await programFor(ben)
    .methods.openShift("Friday dinner", 480, [ana.publicKey, ben.publicKey])
    .accountsPartial({ opener: ben.publicKey, team, mint, shift, vault, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  console.log("4. Ben opened a shift (Ana, Ben)", explorer(sig));
  sig = await programFor(kasia).methods.joinShift().accountsPartial({ member: kasia.publicKey, team, shift }).rpc();
  console.log("5. Kasia joined it herself     ", explorer(sig));

  for (const amount of [40e6, 25e6]) {
    sig = await programFor(guest)
      .methods.tip(new BN(amount))
      .accountsPartial({ tipper: guest.publicKey, shift, mint, tipperToken: ataOf(guest.publicKey), vault, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
    console.log(`6. guest tipped ${amount / 1e6} tUSDC        `, explorer(sig));
  }

  // --- 3. an outsider (the restaurant, say) tries to take the money ---
  await expectFail("outsider withdraws from the vault", () =>
    sendAndConfirmTransaction(
      connection,
      new Transaction().add(createTransferCheckedInstruction(vault, mint, ataOf(outsider.publicKey), outsider.publicKey, 65e6, 6)),
      [outsider],
    ),
  );
  await expectFail("outsider joins the shift", () =>
    programFor(outsider).methods.joinShift().accountsPartial({ member: outsider.publicKey, team, shift }).rpc(),
  );
  await expectFail("outsider redirects a share", () =>
    programFor(outsider)
      .methods.settle()
      .accountsPartial({ caller: outsider.publicKey, shift, openedBy: ben.publicKey, mint, vault, tokenProgram: TOKEN_PROGRAM_ID })
      .remainingAccounts([outsider, ben, kasia].map((k) => ({ pubkey: ataOf(k.publicKey), isSigner: false, isWritable: true })))
      .rpc(),
  );
  await expectFail("outsider enters hours", () =>
    programFor(outsider).methods.submitHours(480).accountsPartial({ staff: outsider.publicKey, shift }).rpc(),
  );

  sig = await programFor(ana).methods.endShift().accountsPartial({ staff: ana.publicKey, shift }).rpc();
  console.log("7. Ana ended the shift         ", explorer(sig));

  if (!timeoutPath) {
    for (const s of crew) {
      sig = await programFor(s.kp).methods.submitHours(s.minutes).accountsPartial({ staff: s.kp.publicKey, shift }).rpc();
      console.log(`8. ${s.name.padEnd(5)} submitted ${s.minutes / 60}h       `, explorer(sig));
    }
    const { version } = await programFor(stranger).account.shift.fetch(shift);
    for (const s of crew.slice(0, 2)) {
      sig = await programFor(s.kp).methods.confirm(version).accountsPartial({ staff: s.kp.publicKey, shift }).rpc();
      console.log(`9. ${s.name.padEnd(5)} confirmed v${version}         `, explorer(sig));
    }
  } else {
    console.log(`   nobody confirms… waiting ${WINDOW + 5}s for the window`);
    await sleep((WINDOW + 5) * 1000);
  }

  // Staff wallets are listed in roster order: Ana, Ben, Kasia.
  sig = await programFor(stranger)
    .methods.settle()
    .accountsPartial({ caller: stranger.publicKey, shift, openedBy: ben.publicKey, mint, vault, tokenProgram: TOKEN_PROGRAM_ID })
    .remainingAccounts(crew.map((s) => ({ pubkey: ataOf(s.kp.publicKey), isSigner: false, isWritable: true })))
    .rpc();
  console.log("10. STRANGER settled           ", explorer(sig));

  for (const s of [...crew.map((x) => ({ kp: x.kp, name: x.name })), { kp: outsider, name: "OUTSIDER" }]) {
    const b = await connection.getTokenAccountBalance(ataOf(s.kp.publicKey));
    console.log(`   ${s.name.padEnd(8)} ${b.value.uiAmountString} tUSDC`);
  }
  console.log(`\nView in app: http://localhost:5174/#/shift/${shift.toBase58()}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
