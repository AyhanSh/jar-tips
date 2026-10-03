// Sample data shown while the guided tour runs, so a first-time visitor (no team yet)
// still sees a real-looking team and shift to point at. Nothing here touches the chain.

import { createContext } from "react";
import { BN } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, TIP_MINT, type ShiftAccount, type TeamAccount } from "./solana";
import type { Activity } from "./solana";

/** True while the guided tour shows sample data. */
export const DemoMode = createContext(false);

/** A fixed, valid address used as the sample shift's id (not an account on chain). */
export const DEMO_SHIFT = PublicKey.findProgramAddressSync([Buffer.from("guide-demo-shift")], PROGRAM_ID)[0];
export const DEMO_TEAM = PublicKey.findProgramAddressSync([Buffer.from("guide-demo-team")], PROGRAM_ID)[0];
const OLA = PublicKey.findProgramAddressSync([Buffer.from("guide-demo-ola")], PROGRAM_ID)[0];
export const DEMO_VAULT_BALANCE = 35_000_000n; // 35 USDC

const usdc = (n: number) => new BN(Math.round(n * 1e6));

export interface DemoPeople {
  outsider: PublicKey;
  ana: PublicKey;
  ben: PublicKey;
  kasia: PublicKey;
  guest: PublicKey;
}

/** Ana's team. Ana has proposed adding Ola; it waits for one more vote. */
export function demoTeam(p: DemoPeople, now: number): TeamAccount {
  return {
    creator: p.ana,
    mint: TIP_MINT,
    name: "Bistro Wisła",
    confirmWindow: new BN(60),
    shiftCount: new BN(1),
    bump: 255,
    members: [
      { wallet: p.ana, name: "Ana" },
      { wallet: p.ben, name: "Ben" },
      { wallet: p.kasia, name: "Kasia" },
    ],
    proposalCount: 1,
    proposal: { id: 1, add: true, wallet: OLA, name: "Ola", proposer: p.ana, createdAt: new BN(now - 600), votes: 1 },
  } as TeamAccount;
}

/** A shift two hours in: three tips, two people have entered hours, nobody has agreed yet. */
export function demoShift(p: DemoPeople, now: number): ShiftAccount {
  return {
    team: DEMO_TEAM,
    openedBy: p.ana,
    mint: TIP_MINT,
    index: new BN(0),
    bump: 255,
    label: "Friday dinner",
    openedAt: new BN(now - 2 * 3600),
    closesAt: new BN(now + 6 * 3600),
    scheduledMinutes: 480,
    confirmWindow: new BN(60),
    version: 3,
    totalTipped: usdc(35),
    tipCount: 3,
    settled: false,
    settledAt: new BN(0),
    byTimeout: false,
    paidOut: new BN(0),
    staff: [
      { wallet: p.ana, name: "Ana", minutes: 480, submitted: true, confirmedVersion: 0, paid: new BN(0) },
      { wallet: p.ben, name: "Ben", minutes: 360, submitted: true, confirmedVersion: 0, paid: new BN(0) },
      { wallet: p.kasia, name: "Kasia", minutes: 0, submitted: false, confirmedVersion: 0, paid: new BN(0) },
    ],
  } as ShiftAccount;
}

export function demoActivity(p: DemoPeople, now: number): Activity[] {
  const row = (action: string, ago: number, signer: PublicKey, err = false): Activity => ({
    signature: `demo-${action}-${ago}`,
    time: now - ago,
    action,
    signer: signer.toBase58(),
    err,
  });
  return [
    row("Hours entered", 300, p.ben),
    row("Hours entered", 420, p.ana),
    row("Outsider tried to withdraw", 900, p.outsider, true),
    row("Tip received", 1500, p.guest),
    row("Tip received", 3000, p.guest),
    row("Tip received", 5400, p.guest),
    row("Shift opened", 7200, p.ana),
  ];
}
