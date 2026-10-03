// Who is signing right now. The connected browser wallet is the owner in the
// demo; Ana, Ben, Kasia and a guest are throwaway devnet keypairs kept in this
// browser so one laptop can play every role without switching wallets.
// They are ordinary signers: the program can't tell them apart from Phantom.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { explainFailure, faucetIxs } from "./solana";

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
  { id: "owner", name: "Demo owner", role: "Owner (backup)" },
  { id: "ana", name: "Ana", role: "Waiter" },
  { id: "ben", name: "Ben", role: "Bartender" },
  { id: "kasia", name: "Kasia", role: "Runner" },
  { id: "guest", name: "Guest", role: "Customer" },
];

const STORE = "napiwek.demo-keys.v1";

/** Fallback confirmation when the RPC rate-limits confirmTransaction. Returns the tx error, or null. */
async function pollStatus(connection: Connection, signature: string): Promise<unknown> {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const { value } = await connection.getSignatureStatuses([signature]);
      const st = value[0];
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return st.err;
    } catch {
      /* rate-limited again; keep waiting */
    }
  }
  throw new Error("Timed out waiting for confirmation. Check the transaction on Explorer: " + signature);
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
      { id: "wallet", name: "My wallet", role: "Owner", publicKey: wallet.publicKey },
      ...DEMO.map((d) => ({ ...d, publicKey: keys[d.id].publicKey, keypair: keys[d.id] })),
    ],
    [wallet.publicKey, keys],
  );
  const active = actors.find((a) => a.id === activeId) ?? actors[0];
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
      tx.recentBlockhash = latest.blockhash;
      tx.feePayer = who.publicKey;
      let signature: string;
      if (who.keypair) {
        tx.sign(who.keypair, ...(opts.signers ?? []));
        const raw = tx.serialize();
        signature = await retry429(() => connection.sendRawTransaction(raw, { skipPreflight }));
      } else {
        signature = await wallet.sendTransaction(tx, connection, { signers: opts.signers, skipPreflight });
      }
      // A failed tx either comes back as `value.err` or, if the status poll wins the race against
      // the websocket, is thrown as the raw `{ InstructionError }` object. Treat both the same.
      let err: unknown = null;
      try {
        err = (await connection.confirmTransaction({ signature, ...latest }, "confirmed")).value.err;
      } catch (e) {
        if (!(e instanceof Error)) err = e;
        else if (!/429/.test(e.message)) throw e;
        else err = await pollStatus(connection, signature);
      }
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

  // Give every demo keypair a little devnet SOL for fees, and the guest some test USDC to tip with.
  const fundCrew = useCallback(async () => {
    const from = wallet.publicKey;
    if (!from) throw new Error("Connect a wallet first");
    const tx = new Transaction();
    for (const d of DEMO) {
      const bal = await connection.getBalance(keys[d.id].publicKey);
      if (bal < 0.01 * LAMPORTS_PER_SOL)
        tx.add(SystemProgram.transfer({ fromPubkey: from, toPubkey: keys[d.id].publicKey, lamports: 0.02 * LAMPORTS_PER_SOL }));
    }
    const { ixs, faucet } = faucetIxs(from, keys.guest.publicKey, 200_000_000n);
    tx.add(...ixs);
    if ((await connection.getBalance(from)) < 0.12 * LAMPORTS_PER_SOL)
      throw new Error("Your wallet needs about 0.12 devnet SOL to fund the demo wallets");
    const r = await send(tx, { as: actors[0], signers: [faucet] });
    if (r.failed) throw new Error(r.reason);
    return r.signature;
  }, [wallet.publicKey, connection, keys, send, actors]);

  return (
    <ActorCtx.Provider value={{ actors, active, setActive, actorFor, owner, send, fundCrew }}>{children}</ActorCtx.Provider>
  );
}
