// Who is signing right now. The connected browser wallet is the owner in the
// demo; Ana, Ben, Kasia and a guest are throwaway devnet keypairs kept in this
// browser so one laptop can play every role without switching wallets.
// They are ordinary signers: the program can't tell them apart from Phantom.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { utils } from "@anchor-lang/core";
import { ata, explainFailure, faucetIxs, tokenBalance } from "./solana";
import sponsorSecret from "./sponsor-keypair.json";

/** Devnet-only "gas station": tops up the demo wallets when the visitor has no SOL. Public on purpose. */
const SPONSOR = Keypair.fromSecretKey(Uint8Array.from(sponsorSecret as number[]));

export type ActorId = "wallet" | "owner" | "ana" | "ben" | "kasia" | "guest";

export interface Actor {
  id: ActorId;
  name: string;
  role: string;
  publicKey: PublicKey | null;
  keypair?: Keypair;
}

export interface SendResult {
  signature: string;
  failed: boolean;
  reason?: string;
}

const DEMO: { id: Exclude<ActorId, "wallet">; name: string; role: string }[] = [
  { id: "owner", name: "Demo owner", role: "Owner · no wallet needed" },
  { id: "ana", name: "Ana", role: "Staff · waiter" },
  { id: "ben", name: "Ben", role: "Staff · bartender" },
  { id: "kasia", name: "Kasia", role: "Staff · runner" },
  { id: "guest", name: "Guest", role: "Customer" },
];

const STORE = "napiwek.demo-keys.v1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tiny priority fee (≈0.000004 SOL) so a busy devnet leader still picks the transaction up. */
const PRIORITY_FEE = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 });

/**
 * Sends a signed transaction and keeps re-broadcasting it every 2s until it confirms or its
 * blockhash expires. Devnet regularly drops a transaction sent only once (that's what
 * "block height exceeded" means), and rebroadcasting the same bytes is safe: a signature can
 * only ever land once. Returns the on-chain error (null = success).
 */
async function sendAndConfirmRaw(
  connection: Connection,
  raw: Buffer | Uint8Array | null,
  signature: string,
  lastValidBlockHeight: number,
  skipPreflight: boolean,
): Promise<unknown> {
  // First send with preflight (unless asked not to) so simulation errors surface immediately.
  // raw = null: the wallet already sent it; only watch for confirmation.
  if (raw) await retry429(() => connection.sendRawTransaction(raw, { skipPreflight, maxRetries: 0 }));
  for (let i = 0; ; i++) {
    await sleep(2000);
    try {
      const st = (await connection.getSignatureStatuses([signature])).value[0];
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return st.err;
      if (i % 3 === 2 && (await connection.getBlockHeight("confirmed")) > lastValidBlockHeight) break;
      if (raw) connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => {});
    } catch {
      /* rate-limited: keep trying until the blockhash expires */
    }
  }
  // One last look before giving up: it may have landed just as the blockhash expired.
  const st = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
  if (st) return st.err;
  throw new Error("Devnet didn't pick the transaction up in time. Nothing was sent or charged, so just try again.");
}

/** Polling gives up on HTTP 429 (see main.tsx); user actions back off and retry instead. */
async function retry429<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries - 1 || !/429/.test(String((e as Error)?.message ?? e))) throw e;
      await new Promise((r) => setTimeout(r, 600 * 2 ** i));
    }
  }
}

function loadDemoKeys(): Record<string, Keypair> {
  let saved: Record<string, number[]> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORE) ?? "{}");
  } catch {
    saved = {};
  }
  const out: Record<string, Keypair> = {};
  for (const d of DEMO) {
    out[d.id] = saved[d.id] ? Keypair.fromSecretKey(Uint8Array.from(saved[d.id])) : Keypair.generate();
    saved[d.id] = Array.from(out[d.id].secretKey);
  }
  try {
    localStorage.setItem(STORE, JSON.stringify(saved));
  } catch {
    /* private window: keys live for this tab only */
  }
  return out;
}

interface Ctx {
  actors: Actor[];
  /** The identities to offer in pickers: the demo owner only when no wallet is connected. */
  visible: Actor[];
  active: Actor;
  setActive: (id: ActorId) => void;
  actorFor: (pk: PublicKey) => Actor | undefined;
  /** The identity that plays the venue owner: the browser wallet, or the demo owner when last chosen. */
  owner: Actor;
  /** Sign and send as the active actor (or `as`). `expectFail` skips preflight so a rejected tx lands on-chain. */
  send: (tx: Transaction, opts?: { as?: Actor; signers?: Keypair[]; expectFail?: boolean }) => Promise<SendResult>;
  fundCrew: () => Promise<string>;
}

const ActorCtx = createContext<Ctx | null>(null);
export const useActors = () => useContext(ActorCtx)!;

export function ActorProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const keys = useMemo(loadDemoKeys, []);
  const [ownerId, setOwnerId] = useState<"wallet" | "owner">(() => {
    try {
      return localStorage.getItem(STORE + ".owner") === "owner" ? "owner" : "wallet";
    } catch {
      return "wallet";
    }
  });
  const [activeId, setActiveId] = useState<ActorId>(() => {
    try {
      return (localStorage.getItem(STORE + ".active") as ActorId) || "wallet";
    } catch {
      return "wallet";
    }
  });
  const setActive = useCallback((id: ActorId) => {
    setActiveId(id);
    if (id === "wallet" || id === "owner") setOwnerId(id);
    try {
      if (id === "wallet" || id === "owner") localStorage.setItem(STORE + ".owner", id);
    } catch {
      /* not persisted */
    }
    try {
      localStorage.setItem(STORE + ".active", id);
    } catch {
      /* not persisted */
    }
  }, []);

  const actors: Actor[] = useMemo(
    () => [
      { id: "wallet", name: "You", role: "Owner · your wallet", publicKey: wallet.publicKey },
      ...DEMO.map((d) => ({ ...d, publicKey: keys[d.id].publicKey, keypair: keys[d.id] })),
    ],
    [wallet.publicKey, keys],
  );
  const active = actors.find((a) => a.id === activeId) ?? actors[0];
  const visible = actors.filter((a) => a.id !== "owner" || !wallet.publicKey || activeId === "owner");
  const owner = actors.find((a) => a.id === ownerId) ?? actors[0];
  const actorFor = useCallback(
    (pk: PublicKey) => actors.find((a) => a.publicKey?.equals(pk)),
    [actors],
  );

  const send = useCallback<Ctx["send"]>(
    async (tx, opts = {}) => {
      const who = opts.as ?? active;
      if (!who.publicKey) throw new Error("Connect a wallet first");
      const skipPreflight = !!opts.expectFail;
      const latest = await retry429(() => connection.getLatestBlockhash("confirmed"));
      tx.instructions = [PRIORITY_FEE, ...tx.instructions];
      tx.recentBlockhash = latest.blockhash;
      tx.feePayer = who.publicKey;

      let signature: string;
      let raw: Buffer | null = null;
      if (who.keypair) {
        // Demo keypairs: the app signs and keeps re-broadcasting until it lands.
        tx.sign(who.keypair, ...(opts.signers ?? []));
        raw = tx.serialize();
        signature = utils.bytes.bs58.encode(tx.signature!);
      } else {
        // Browser wallets: Phantom's recommended signAndSendTransaction. Sign-only requests from
        // unknown sites get extra security warnings. The app still watches for confirmation itself.
        signature = await wallet.sendTransaction(tx, connection, { signers: opts.signers, skipPreflight, maxRetries: 10 });
      }
      const err = await sendAndConfirmRaw(connection, raw, signature, latest.lastValidBlockHeight, skipPreflight);
      if (!err) return { signature, failed: false };
      let logs: string[] | null | undefined;
      for (let i = 0; i < 5 && !logs; i++) {
        const t = await retry429(() =>
          connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }),
        );
        logs = t?.meta?.logMessages;
        if (!logs) await new Promise((r) => setTimeout(r, 800));
      }
      return { signature, failed: true, reason: explainFailure(logs) };
    },
    [active, connection, wallet],
  );

  // Give every demo keypair a little devnet SOL for fees and rent, and the guest some test USDC.
  // Paid by the connected wallet when it can afford it, otherwise by the bundled devnet sponsor,
  // so a judge with no wallet (or an empty one) can still run the whole demo.
  const fundCrew = useCallback(async () => {
    const want: Record<string, number> = { owner: 0.03, ana: 0.01, ben: 0.01, kasia: 0.01, guest: 0.01 };
    const demoKeys = DEMO.map((d) => keys[d.id].publicKey);
    const infos = await connection.getMultipleAccountsInfo(demoKeys);
    const transfers = DEMO.map((d, i) => ({ to: demoKeys[i], lamports: Math.round(want[d.id] * LAMPORTS_PER_SOL), have: infos[i]?.lamports ?? 0 }))
      .filter((t) => t.have < t.lamports / 2);
    const guestUsdc = await tokenBalance(connection, ata(keys.guest.publicKey));
    if (!transfers.length && guestUsdc >= 50_000_000n) throw new Error("Demo wallets already have enough to play");

    const total = transfers.reduce((a, t) => a + t.lamports, 0) + 0.005 * LAMPORTS_PER_SOL;
    const walletBal = wallet.publicKey ? await connection.getBalance(wallet.publicKey) : 0;
    const payer: Actor | null =
      wallet.publicKey && walletBal >= total + 0.01 * LAMPORTS_PER_SOL
        ? actors[0]
        : (await connection.getBalance(SPONSOR.publicKey)) >= total
          ? { id: "guest", name: "Demo sponsor", role: "", publicKey: SPONSOR.publicKey, keypair: SPONSOR }
          : null;
    if (!payer) throw new Error("The free demo funding has run out. Connect a wallet with devnet SOL (faucet.solana.com).");

    const tx = new Transaction();
    for (const t of transfers) tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey!, toPubkey: t.to, lamports: t.lamports }));
    const signers = [];
    if (guestUsdc < 50_000_000n) {
      const { ixs, faucet } = faucetIxs(payer.publicKey!, keys.guest.publicKey, 200_000_000n);
      tx.add(...ixs);
      signers.push(faucet);
    }
    const r = await send(tx, { as: payer, signers });
    if (r.failed) throw new Error(r.reason);
    return r.signature;
  }, [wallet.publicKey, connection, keys, send, actors]);

  return (
    <ActorCtx.Provider value={{ actors, visible, active, setActive, actorFor, owner, send, fundCrew }}>{children}</ActorCtx.Provider>
  );
}
