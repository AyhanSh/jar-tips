# Honest limitations

These are the trust assumptions we could not remove, or have not removed yet.

## Trust that remains

- **The founder picks the first roster.** This is the one moment of trust: the person who starts the team could list a fake coworker. It is public, the real coworkers see it before working a single shift, and they can vote the fake out as soon as they are a majority. Real identity (a venue code printed in the staff room, or a payroll attestation) is on the roadmap.
- **Majority rule is only as honest as the majority.** If most of a team colludes, they can outvote the rest, both on membership and on confirming hours.
- **Hours are self-reported** and checked by peers. A greedy waiter can inflate their own, but the majority won't confirm, and without a majority the fallback is an equal split.
- **The mint issuer.** The team chooses its mint once. A stablecoin issuer keeps its own powers over its token. For example, USDC has a freeze authority, and a Token-2022 mint could carry a permanent delegate. Jar removes the restaurant, not the issuer of the money. The demo uses a test USDC with a public faucet.

## Product limits

- **Names are on-chain.** First names or nicknames only, max 16 bytes.
- **Pooled tips only.** A QR tips the whole shift, not one waiter. Personal tips (per-waiter QR, 100% to that person) are a planned extension.
- **12 people per team and per shift**, a deliberate cap so that `settle` pays everyone in one atomic transaction.
- **Off-ramp.** Staff receive USDC. Turning it into złoty is a separate step (an exchange, or a stablecoin card).

## Demo-only shortcuts

- **The demo funding key is public.** `app/src/sponsor-keypair.json` is a devnet-only "gas station" with a little devnet SOL, so judges can play without a wallet. Like the test-USDC faucet key (`app/src/faucet-keypair.json`), it is public on purpose and **controls nothing in the program**.
- **Demo people live in your browser.** Ana, Ben, Kasia, the guest and the restaurant are keypairs in `localStorage`, so one laptop can play every role. In production, each person signs with their own wallet.
- **Public devnet RPC.** It is rate-limited, so the app polls gently and backs off on HTTP 429.

## From demo to product

- **Who pays:** teams or venues pay a small monthly fee for the app, never a cut of tips.
- **POS integration:** print the shift QR on the receipt, and accept card tips through an on-ramp that settles into the vault as USDC.
- **Staff identity:** join a team with a one-time code from the staff room, so the founder can't invent people. Payroll export for tax reporting.
- **Weighted roles:** shares such as kitchen 0.5×, voted on by the team and fixed when the shift opens.
