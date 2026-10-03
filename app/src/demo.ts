// Sample data shown while the guided tour runs, so a first-time visitor (no venue yet)
// still sees a real-looking venue, shift and team to point at. Nothing here touches the chain.

import { createContext } from "react";
import { BN } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, TIP_MINT, type ShiftAccount, type VenueAccount } from "./solana";
import type { Activity } from "./solana";

/** True while the guided tour shows sample data. */
export const DemoMode = createContext(false);

/** A fixed, valid address used as the sample shift's id (not an account on chain). */
export const DEMO_SHIFT = PublicKey.findProgramAddressSync([Buffer.from("guide-demo-shift")], PROGRAM_ID)[0];
const DEMO_VENUE = PublicKey.findProgramAddressSync([Buffer.from("guide-demo-venue")], PROGRAM_ID)[0];
export const DEMO_VAULT_BALANCE = 35_000_000n; // 35 USDC

const usdc = (n: number) => new BN(Math.round(n * 1e6));

export interface DemoPeople {
  owner: PublicKey;
  ana: PublicKey;
  ben: PublicKey;
  kasia: PublicKey;
  guest: PublicKey;
}

export function demoVenue(p: DemoPeople): VenueAccount {
  return {
    owner: p.owner,
    mint: TIP_MINT,
    name: "Bistro Wisła",
    confirmWindow: new BN(60),
    shiftCount: new BN(1),
    bump: 255,
  } as VenueAccount;
}

/** A shift two hours in: three tips, two people have entered hours, nobody has agreed yet. */
export function demoShift(p: DemoPeople, now: number): ShiftAccount {
  return {
    venue: DEMO_VENUE,
    owner: p.owner,
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
    row("Owner tried to withdraw", 900, p.owner, true),
    row("Tip received", 1500, p.guest),
    row("Tip received", 3000, p.guest),
    row("Tip received", 5400, p.guest),
    row("Shift opened", 7200, p.owner),
  ];
}
