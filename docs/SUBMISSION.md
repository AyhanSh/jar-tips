# Submission text

**Title:** Jar: restaurant tips with no middleman

**One-liner:** Guests tip by QR into a shift vault controlled only by a Solana program. There's no owner: the staff run the jar themselves, change the team only by majority vote, confirm their own hours, and anyone can trigger the pro-rata payout.

**Target user:** Waiters, bartenders and runners in Polish restaurants and bars whose card/QR tips are pooled per shift (5–12-person teams).

## Description

When a guest tips by card or QR, the tip doesn't reach the waiter. It settles into the restaurant's merchant account with the revenue, and staff
have to trust the owner to pass it on, split fairly and on time. They can't see the shift total. The UK made it law in October 2024 that
employers pass on 100% of tips, because staff had no way to check. A law still needs an inspector and a tribunal.

Jar removes the owner from the money entirely. The restaurant has no account, key or role in the program:

1. **A waiter starts a team** with their coworkers. The founder gets no extra rights. **Adding or removing anyone needs more than half of the team's votes.**
2. **Any team member opens a shift** for the coworkers working it (team members only; anyone left out adds themselves). The program creates a vault whose only authority is a program-derived address.
3. **Guests tip by QR**: a plain web page with 5 / 10 / 20 USDC buttons. Tokens go straight from the guest's wallet into the vault.
4. **Staff submit their own hours** (capped at the shift length). Every change bumps a version number and voids earlier confirmations.
5. When **more than half the shift confirms** the current version, **anyone** can call `settle`: the program splits the pot pro-rata by minutes and pays every staff member's wallet in one transaction, then closes the vault.
6. If no majority forms within the confirm window, **anyone** can trigger an **equal split**, so nobody can hold the pot hostage.

## Design rationale
- **Relationship:** guest → staff, today routed through the employer.
- **Middleman:** the restaurant owner (with the card acquirer underneath), who holds tip money and decides who's in the pool, the split, timing and deductions.
- **What changes:** custody moves to a PDA vault with no private key; team membership is a majority vote; the split rule, the majority threshold and the fallback are code; payout is permissionless. No account in the program has special rights.
- **Where the middleman disappears in code:** `settle` (`programs/napiwek/src/lib.rs:263`). The transfer authority is the shift PDA, and every payout account is checked against the on-chain roster. The demo shows the restaurant (an outsider) trying three times (withdraw, redirect, join); every transaction lands on devnet and fails.
- **Why blockchain:** custody without a custodian, a publicly verifiable history of every tip, vote and payout, and enforcement before the fact instead of a lawsuit after it, for about $0.001 per tip.

## Links
- Live app: https://jar-tips.vercel.app
- Repo: https://github.com/AyhanSh/jar-tips
- Video (≤ 3 min): [link]
- Slides (PDF, 10 slides): [link]
- Program (devnet): https://explorer.solana.com/address/HrFcxm1y86UTdeJB7r8khiXfSKXSvf77p7S29MPj2ZSD?cluster=devnet
