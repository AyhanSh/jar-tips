// Offline check: the largest transactions the app builds stay under Solana's 1232-byte limit with a full 12-person roster.
//   npx tsx scripts/check-tx-size.mts

import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, Transaction, clusterApiUrl } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import idl from "../src/idl/napiwek.json" with { type: "json" };
import devnet from "../src/devnet.json" with { type: "json" };
const p = new Program(idl as any, { connection: new Connection(clusterApiUrl("devnet")) } as AnchorProvider);
const mint = new PublicKey(devnet.testUsdcMint);
const owner = Keypair.generate().publicKey;
const pid = new PublicKey(idl.address);
const venue = PublicKey.findProgramAddressSync([Buffer.from("venue"), owner.toBuffer()], pid)[0];
const shift = PublicKey.findProgramAddressSync([Buffer.from("shift"), venue.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)], pid)[0];
const vault = getAssociatedTokenAddressSync(mint, shift, true);
const staff = Array.from({ length: 12 }, (_, i) => ({ wallet: Keypair.generate().publicKey, name: "Małgorzata ąę" .slice(0, 12) + i }));
const size = (ixs: any[]) => { const t = new Transaction().add(...ixs); t.recentBlockhash = PublicKey.default.toBase58(); t.feePayer = owner; return t.serializeMessage().length + 1 + 64; };
const open = await p.methods.openShift("Friday dinner shift 2026", 480, staff).accountsPartial({ owner, venue, mint, shift, vault, tokenProgram: TOKEN_PROGRAM_ID }).instruction();
const settle = await p.methods.settle().accountsPartial({ caller: owner, shift, owner, mint, vault, tokenProgram: TOKEN_PROGRAM_ID })
  .remainingAccounts(staff.map((s) => ({ pubkey: getAssociatedTokenAddressSync(mint, s.wallet), isSigner: false, isWritable: true }))).instruction();
const atas = staff.slice(0, 4).map((s) => createAssociatedTokenAccountIdempotentInstruction(owner, getAssociatedTokenAddressSync(mint, s.wallet), s.wallet, mint));
const oldOpen = [...staff.map((s) => createAssociatedTokenAccountIdempotentInstruction(owner, getAssociatedTokenAddressSync(mint, s.wallet), s.wallet, mint)), open];
console.log("limit 1232 bytes");
console.log("open_shift, 12 staff:", size([open]));
console.log("settle, 12 staff:", size([settle]));
console.log("4 account-creates (one chunk):", size(atas));
try { console.log("OLD open_shift + 12 creates:", size(oldOpen)); } catch (e) { console.log("OLD open_shift + 12 creates: cannot even serialize ->", (e as Error).message.slice(0, 60)); }
