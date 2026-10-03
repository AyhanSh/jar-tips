// Funds wallets from ~/.config/solana/id.json: 0.03 devnet SOL each plus 200 test USDC.
// Handy for the demo crew when no browser wallet is connected:
//
//   npx tsx scripts/fund.ts <pubkey> [pubkey ...]

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, clusterApiUrl, sendAndConfirmTransaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import devnet from "../src/devnet.json" with { type: "json" };

const load = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));

async function main() {
  const connection = new Connection(process.env.RPC_URL ?? clusterApiUrl("devnet"), "confirmed");
  const funder = load(join(homedir(), ".config/solana/id.json"));
  const faucet = load(join(import.meta.dirname, "..", "src", "faucet-keypair.json"));
  const mint = new PublicKey(devnet.testUsdcMint);
  const tx = new Transaction();
  for (const arg of process.argv.slice(2)) {
    const to = new PublicKey(arg);
    const ata = getAssociatedTokenAddressSync(mint, to);
    tx.add(
      SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: to, lamports: 0.03 * LAMPORTS_PER_SOL }),
      createAssociatedTokenAccountIdempotentInstruction(funder.publicKey, ata, to, mint),
      createMintToInstruction(mint, ata, faucet.publicKey, 200_000_000n),
    );
  }
  const sig = await sendAndConfirmTransaction(connection, tx, [funder, faucet]);
  console.log("funded", process.argv.length - 2, "wallets:", `https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
