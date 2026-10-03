// Polling hooks for on-chain state. Kept small and deliberate: the public devnet RPC rate-limits.

import { createContext, createElement, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useInterval, useProgram } from "./hooks";
import { shiftPda, teamPda, tokenBalance, vaultOf, type ShiftAccount, type TeamAccount } from "./solana";
import { useActors } from "./actors";
import { DEMO_SHIFT, DEMO_TEAM, DEMO_VAULT_BALANCE, DemoMode, demoShift, demoTeam, type DemoPeople } from "./demo";

/** The people in the guide's sample data. */
export function useDemoPeople(): DemoPeople {
  const { actors } = useActors();
  const by = (id: string) => actors.find((a) => a.id === id)!.publicKey!;
  return useMemo(
    () => ({ outsider: by("outsider"), ana: by("ana"), ben: by("ben"), kasia: by("kasia"), guest: by("guest") }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

function useDemoData() {
  const demo = useContext(DemoMode);
  const people = useDemoPeople();
  const now = useMemo(() => Math.floor(Date.now() / 1000), [demo]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(
    () => (demo ? { people, team: demoTeam(people, now), shift: demoShift(people, now) } : null),
    [demo, people, now],
  );
}

export interface ShiftRow {
  key: PublicKey;
  acc: ShiftAccount;
}

export interface TeamData {
  key: PublicKey | null;
  /** undefined = loading, null = none */
  team: TeamAccount | null | undefined;
  /** Newest first. */
  shifts: ShiftRow[];
}

/** A team and its shifts, polled. Sample data while the guide runs. */
export function useTeamData(key: PublicKey | null | undefined, tick: number, ms = 12000): TeamData {
  const demo = useDemoData();
  const real = useRealTeamData(demo ? null : key, tick, ms);
  if (demo) return { key: DEMO_TEAM, team: demo.team, shifts: [{ key: DEMO_SHIFT, acc: demo.shift }] };
  if (key === null) return { key: null, team: null, shifts: [] };
  return real;
}

function useRealTeamData(key: PublicKey | null | undefined, tick: number, ms: number): TeamData {
  const program = useProgram();
  const [data, setData] = useState<TeamData>({ key: null, team: undefined, shifts: [] });
  useInterval(
    async () => {
      if (!key) return setData({ key: null, team: undefined, shifts: [] });
      const t = await program.account.team.fetchNullable(key);
      const keys = t ? Array.from({ length: t.shiftCount.toNumber() }, (_, i) => shiftPda(key, i)).reverse() : [];
      const accs = keys.length ? await program.account.shift.fetchMultiple(keys) : [];
      // Set both together: a rate-limited second call must not leave a team with "no shifts".
      setData({ key, team: t, shifts: keys.map((k, i) => ({ key: k, acc: accs[i]! })).filter((s) => s.acc) });
    },
    ms,
    [key?.toBase58(), tick],
  );
  return data.key && key && data.key.equals(key) ? data : { key: key ?? null, team: undefined, shifts: [] };
}

/**
 * Which team this browser plays. There's no owner to look up, so: the team "you" started,
 * else a team you're a member of that one of this browser's people started, else (with a
 * wallet) any team on chain that lists you. undefined = still looking, null = none.
 */
function useMyTeamKey(tick: number): PublicKey | null | undefined {
  const program = useProgram();
  const { connection } = useConnection();
  const { actors, me, meChosen } = useActors();
  const [key, setKey] = useState<PublicKey | null | undefined>(undefined);
  const lastScan = useRef(0);
  const locals = actors.filter((a) => a.publicKey && a.id !== "guest" && a.id !== "outsider").map((a) => a.publicKey!);
  const meKey = meChosen ? me.publicKey : null;
  useInterval(
    async () => {
      if (!meKey) return setKey(null);
      const creators = [meKey, ...locals.filter((k) => !k.equals(meKey))];
      const infos = await connection.getMultipleAccountsInfo(creators.map(teamPda));
      const found = infos
        .map((info, i) => (info ? { key: teamPda(creators[i]), team: program.coder.accounts.decode<TeamAccount>("team", info.data) } : null))
        .filter((x): x is { key: PublicKey; team: TeamAccount } => !!x);
      const mine = found.find((f) => f.team.members.some((m) => m.wallet.equals(meKey)));
      if (mine) return setKey(mine.key);
      // A wallet added to someone else's team: look through every team, at most once a minute.
      if (me.id === "wallet" && Date.now() - lastScan.current > 60000) {
        lastScan.current = Date.now();
        const all = await program.account.team.all();
        const listed = all.find((t) => t.account.members.some((m) => m.wallet.equals(meKey)));
        if (listed) return setKey(listed.publicKey);
      }
      setKey((k) => (k && found.some((f) => f.key.equals(k)) ? k : null));
    },
    15000,
    [meKey?.toBase58(), tick],
  );
  return key;
}

const MyTeam = createContext<TeamData>({ key: null, team: undefined, shifts: [] });

/** Polls "my" team once for the whole app (top bar, menu and team page share it). */
export function TeamProvider({ tick, children }: { tick: number; children: ReactNode }) {
  const demo = useContext(DemoMode);
  const key = useMyTeamKey(tick);
  const data = useTeamData(demo ? DEMO_TEAM : key, tick);
  return createElement(MyTeam.Provider, { value: key === undefined && !demo ? { key: null, team: undefined, shifts: [] } : data }, children);
}

export const useMyTeam = () => useContext(MyTeam);

/** Shift → team, filled by useShift so the chrome rarely needs its own request. */
const teamCache = new Map<string, PublicKey>();

/** One shift, its team and the live vault balance. */
export function useShift(key: PublicKey | null, tick: number) {
  const demo = useDemoData();
  const isDemo = !!demo && !!key?.equals(DEMO_SHIFT);
  const real = useRealShift(isDemo ? null : key, tick);
  if (isDemo) return { shift: demo!.shift as ShiftAccount | null | undefined, team: demo!.team as TeamAccount | null, vault: DEMO_VAULT_BALANCE };
  return real;
}

function useRealShift(key: PublicKey | null, tick: number) {
  const program = useProgram();
  const { connection } = useConnection();
  const [shift, setShift] = useState<ShiftAccount | null | undefined>(undefined);
  const [team, setTeam] = useState<TeamAccount | null>(null);
  const [vault, setVault] = useState<bigint>(0n);
  const teamTick = useRef<string | null>(null);
  useInterval(
    async () => {
      if (!key) return;
      const s = await program.account.shift.fetchNullable(key);
      setShift(s);
      if (!s) return;
      teamCache.set(key.toBase58(), s.team);
      // The team changes rarely (votes); refresh it after each of our own transactions.
      if (teamTick.current !== `${s.team.toBase58()}:${tick}`) {
        teamTick.current = `${s.team.toBase58()}:${tick}`;
        setTeam(await program.account.team.fetchNullable(s.team));
      }
      if (!s.settled) setVault(await tokenBalance(connection, vaultOf(key)));
    },
    5000,
    [key?.toBase58(), tick],
  );
  return { shift, team, vault };
}

/** The team a shift belongs to, fetched once, so shared chrome (breadcrumbs, menus) can show it. */
export function useShiftTeam(key: PublicKey | null) {
  const demo = useDemoData();
  const isDemo = !!demo && !!key?.equals(DEMO_SHIFT);
  const real = useRealShiftTeam(isDemo ? null : key);
  return isDemo ? DEMO_TEAM : real;
}

function useRealShiftTeam(key: PublicKey | null) {
  const program = useProgram();
  const [team, setTeam] = useState<PublicKey | null>(key ? (teamCache.get(key.toBase58()) ?? null) : null);
  useInterval(
    async () => {
      if (!key) return setTeam(null);
      const cached = teamCache.get(key.toBase58());
      if (cached) return setTeam(cached);
      const s = await program.account.shift.fetchNullable(key);
      if (s) teamCache.set(key.toBase58(), s.team);
      setTeam(s?.team ?? null);
    },
    // Retries quickly until known (a just-opened shift, or a rate-limited call); cached after that.
    5000,
    [key?.toBase58()],
  );
  return team;
}

/** Live SOL balance of a wallet (null while unknown), refreshed after every transaction. */
export function useSol(key: PublicKey | null, tick = 0) {
  const { connection } = useConnection();
  const [sol, setSol] = useState<number | null>(null);
  useInterval(
    async () => {
      if (!key) return setSol(null);
      setSol((await connection.getBalance(key)) / 1e9);
    },
    15000,
    [key?.toBase58(), tick],
  );
  return sol;
}
