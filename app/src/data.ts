// Polling hooks for on-chain state. Kept small and deliberate: the public devnet RPC rate-limits.

import { useRef, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useInterval, useProgram } from "./hooks";
import { shiftPda, tokenBalance, vaultOf, venuePda, type ShiftAccount, type VenueAccount } from "./solana";

export interface ShiftRow {
  key: PublicKey;
  acc: ShiftAccount;
}

/** A venue (null = owner has none yet, undefined = loading) and its shifts, newest first. */
export function useVenue(owner: PublicKey | null, tick: number, ms = 12000) {
  const program = useProgram();
  const [venue, setVenue] = useState<VenueAccount | null | undefined>(undefined);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  useInterval(
    async () => {
      if (!owner) {
        setVenue(undefined);
        setShifts([]);
        return;
      }
      const v = await program.account.venue.fetchNullable(venuePda(owner));
      setVenue(v);
      if (!v) return setShifts([]);
      const keys = Array.from({ length: v.shiftCount.toNumber() }, (_, i) => shiftPda(venuePda(owner), i)).reverse();
      const accs = keys.length ? await program.account.shift.fetchMultiple(keys) : [];
      setShifts(keys.map((key, i) => ({ key, acc: accs[i]! })).filter((s) => s.acc));
    },
    ms,
    [owner?.toBase58(), tick],
  );
  return { venue, shifts };
}

/** One shift, its venue and the live vault balance. */
export function useShift(key: PublicKey | null, tick: number) {
  const program = useProgram();
  const { connection } = useConnection();
  const [shift, setShift] = useState<ShiftAccount | null | undefined>(undefined);
  const [venue, setVenue] = useState<VenueAccount | null>(null);
  const [vault, setVault] = useState<bigint>(0n);
  const venueLoaded = useRef<string | null>(null);
  useInterval(
    async () => {
      if (!key) return;
      const s = await program.account.shift.fetchNullable(key);
      setShift(s);
      if (!s) return;
      if (venueLoaded.current !== s.venue.toBase58()) {
        venueLoaded.current = s.venue.toBase58();
        setVenue(await program.account.venue.fetchNullable(s.venue));
      }
      if (!s.settled) setVault(await tokenBalance(connection, vaultOf(key)));
    },
    5000,
    [key?.toBase58(), tick],
  );
  return { shift, venue, vault };
}

const ownerCache = new Map<string, PublicKey>();
/** The owner of a shift, fetched once, so shared chrome (breadcrumbs, menus) can show that shift's venue. */
export function useShiftOwner(key: PublicKey | null) {
  const program = useProgram();
  const [owner, setOwner] = useState<PublicKey | null>(key ? (ownerCache.get(key.toBase58()) ?? null) : null);
  useInterval(
    async () => {
      if (!key) return setOwner(null);
      const cached = ownerCache.get(key.toBase58());
      if (cached) return setOwner(cached);
      const s = await program.account.shift.fetchNullable(key);
      if (s) ownerCache.set(key.toBase58(), s.owner);
      setOwner(s?.owner ?? null);
    },
    60000,
    [key?.toBase58()],
  );
  return owner;
}
