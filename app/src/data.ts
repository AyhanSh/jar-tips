// Polling hooks for on-chain state. Kept small and deliberate: the public devnet RPC rate-limits.

import { useContext, useMemo, useRef, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useInterval, useProgram } from "./hooks";
import { shiftPda, tokenBalance, vaultOf, venuePda, type ShiftAccount, type VenueAccount } from "./solana";
import { useActors } from "./actors";
import { DEMO_SHIFT, DEMO_VAULT_BALANCE, DemoMode, demoShift, demoVenue, type DemoPeople } from "./demo";

/** The people in the guide's sample data: the current owner identity plus the demo crew. */
export function useDemoPeople(): DemoPeople {
  const { actors, owner } = useActors();
  const by = (id: string) => actors.find((a) => a.id === id)!.publicKey!;
  const ownerKey = owner.publicKey ?? by("owner");
  return useMemo(
    () => ({ owner: ownerKey, ana: by("ana"), ben: by("ben"), kasia: by("kasia"), guest: by("guest") }),
    [ownerKey.toBase58()], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

function useDemoData() {
  const demo = useContext(DemoMode);
  const people = useDemoPeople();
  const now = useMemo(() => Math.floor(Date.now() / 1000), [demo]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(
    () => (demo ? { people, venue: demoVenue(people), shift: demoShift(people, now) } : null),
    [demo, people, now],
  );
}

export interface ShiftRow {
  key: PublicKey;
  acc: ShiftAccount;
}

/** A venue (null = owner has none yet, undefined = loading) and its shifts, newest first. */
export function useVenue(owner: PublicKey | null, tick: number, ms = 12000) {
  const demo = useDemoData();
  const real = useRealVenue(demo ? null : owner, tick, ms);
  if (demo) return { venue: demo.venue as VenueAccount | null | undefined, shifts: [{ key: DEMO_SHIFT, acc: demo.shift }] as ShiftRow[] };
  return real;
}

function useRealVenue(owner: PublicKey | null, tick: number, ms: number) {
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
      const keys = v ? Array.from({ length: v.shiftCount.toNumber() }, (_, i) => shiftPda(venuePda(owner), i)).reverse() : [];
      const accs = keys.length ? await program.account.shift.fetchMultiple(keys) : [];
      // Set both together: a rate-limited second call must not leave a venue with "no shifts".
      setVenue(v);
      setShifts(keys.map((key, i) => ({ key, acc: accs[i]! })).filter((s) => s.acc));
    },
    ms,
    [owner?.toBase58(), tick],
  );
  return { venue, shifts };
}

/** Shift → owner, filled by useShift so the chrome rarely needs its own request. */
const ownerCache = new Map<string, PublicKey>();

/** One shift, its venue and the live vault balance. */
export function useShift(key: PublicKey | null, tick: number) {
  const demo = useDemoData();
  const isDemo = !!demo && !!key?.equals(DEMO_SHIFT);
  const real = useRealShift(isDemo ? null : key, tick);
  if (isDemo) return { shift: demo!.shift as ShiftAccount | null | undefined, venue: demo!.venue as VenueAccount | null, vault: DEMO_VAULT_BALANCE };
  return real;
}

function useRealShift(key: PublicKey | null, tick: number) {
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
      ownerCache.set(key.toBase58(), s.owner);
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

/** The owner of a shift, fetched once, so shared chrome (breadcrumbs, menus) can show that shift's venue. */
export function useShiftOwner(key: PublicKey | null) {
  const demo = useDemoData();
  const isDemo = !!demo && !!key?.equals(DEMO_SHIFT);
  const real = useRealShiftOwner(isDemo ? null : key);
  return isDemo ? demo!.people.owner : real;
}

function useRealShiftOwner(key: PublicKey | null) {
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
    // Retries quickly until known (a just-opened shift, or a rate-limited call); cached after that.
    5000,
    [key?.toBase58()],
  );
  return owner;
}
