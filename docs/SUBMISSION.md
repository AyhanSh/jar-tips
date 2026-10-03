# Submission text

**Title:** Jar: restaurant tips the owner can't touch

**One-liner:** Guests tip by QR into a shift vault owned by a Solana program; staff confirm their own hours and anyone can trigger the pro-rata payout. The owner has no withdraw permission because the program has no withdraw instruction.

**Target user:** Waiters, bartenders and runners in Polish restaurants and bars whose card/QR tips are pooled per shift (5–15-person teams).

## Description

When a guest tips by card or QR, the tip doesn't reach the waiter. It settles into the restaurant's merchant account with the revenue, and staff
have to trust the owner to pass it on, split fairly and on time. They can't see the shift total. The UK made it law in October 2024 that
employers pass on 100% of tips, because staff had no way to check. A law still needs an inspector and a tribunal.

Jar moves the money out of the owner's hands and into a Solana program:

1. **Owner opens a shift** with the roster. The program creates a vault whose only authority is a program-derived address. This is the owner's last say over the money.
2. **Guests tip by QR**: a plain web page with 5 / 10 / 20 USDC buttons. Tokens go straight from the guest's wallet into the vault.
3. **Staff submit their own hours** (capped at the shift length). Every change bumps a version number and voids earlier confirmations.
4. When **more than half the roster confirms** the current version, **anyone** can call `settle`: the program splits the pot pro-rata by minutes and pays every staff member's wallet in one transaction, then closes the vault.
5. If no majority forms within the confirm window, **anyone** can trigger an **equal split**, so nobody can hold the pot hostage.

## Design rationale
- **Relationship:** guest → staff, today routed through the employer.
- **Middleman:** the restaurant owner (with the card acquirer underneath), who holds tip money and decides split, timing and deductions.
- **What changes:** custody moves to a PDA vault with no private key; the split rule, the majority threshold and the fallback are code; payout is permissionless. The owner keeps exactly one job only they can do: declaring who's working (public, add-only, and they can't be on it).
- **Where the middleman disappears in code:** `settle` (`programs/napiwek/src/lib.rs:186`). The transfer authority is the shift PDA, and every payout account is checked against the on-chain roster. The demo shows the owner trying twice; both transactions land on devnet and fail.
- **Why blockchain:** custody without a custodian, a publicly verifiable history of every tip and payout, and enforcement before the fact instead of a lawsuit after it, for about $0.001 per tip.

## Links
- Repo: [github.com/__/napiwek]
- Video (≤ 3 min): [link]
- Slides (PDF, 10 slides): [link]
- Program (devnet): https://explorer.solana.com/address/APy9737Fhn6SsFCyXeMyHC5hNoagbRMnGp89W3LPH91X?cluster=devnet
