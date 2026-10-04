# The problem and the design

## Which relationship?

A guest wants to thank the people who served them. Cash went straight into the waiter's hand. Card and QR tips don't. They are part of the bill payment, so they settle into the **restaurant's merchant account** along with the revenue. From there, staff depend on the owner to pass the money on, on time and split fairly. Staff have no way to check how much was tipped on their shift.

## Who was the middleman?

The **owner**, with the card acquirer underneath. The owner holds the tips and decides who is in the pool, the split, the timing and the deductions ("card fees", "breakages", "the house share").

This happens often enough that the law steps in. The UK's **Employment (Allocation of Tips) Act**, in force since 1 October 2024, requires employers to pass on 100% of tips. In the US, the FLSA bans employers from keeping tips. Both laws exist because staff can't verify what happens to the money. A law still needs an inspector and a tribunal to enforce it. A program rejects the bad transaction before it happens.

## What changes: every owner power moves somewhere else

Our first version still had an owner who couldn't touch the money but did control the roster, so they could slip in a fake waiter. The current version removes that role completely.

| What the owner used to control | Where it lives now |
|---|---|
| Holding the tips | A token account whose only authority is the **shift PDA**. No private key exists for it |
| Taking money out | **No such instruction exists.** The only exit is `settle`, and it can only pay the shift's staff |
| Who's on the team | `propose` + `vote`: applied only once **more than half** of the current team approves |
| Who worked tonight | Any team member opens a shift and can only list **team members**. Anyone left out adds **themselves** |
| Who worked how long | Each person submits **their own** minutes, capped at the shift length |
| Approving the split | More than half of the shift confirms the **exact version** of everyone's hours |
| Redirecting a share | `settle` checks that each payout account belongs to the person at that roster position |
| When people get paid | Anyone can call `settle` once the rules are met: a waiter, a guest or a bot |

The person who starts the team pays about 0.007 SOL of rent and gets **no extra rights**. Their vote counts once, and the team can vote them out like anyone else.

## Why a blockchain and not a database?

Several tip-splitting apps already run on a database. Each one still has an operator who holds the money and can change a row, and staff can't prove otherwise.

- **Custody without a custodian.** The money sits in an account only the program can sign for. No company holds it and there is no bank account to freeze.
- **Public verifiability.** Every tip, vote, hours entry, confirmation and payout is a public transaction. A waiter can check the shift total on a block explorer without trusting the restaurant or us.
- **Enforcement before the fact.** Invalid transactions are rejected, so nobody has to sue afterwards.
- **Cost.** A tip settles for about $0.001 in fees.

## Why Solana specifically

- **Fees low enough for small tips.** A 5 PLN tip that loses a meaningful share to fees is pointless. On Solana, network fees are a fraction of a cent.
- **Program-derived addresses.** A PDA is an account that only a program can sign for, which is exactly what a vault with no custodian needs.
- **Token interface.** The same instruction accepts classic SPL tokens and Token-2022 mints, such as a regulated złoty or euro stablecoin.
- **One transaction for the whole payout.** A 12-person settle is 707 bytes, well under the 1232-byte limit, so all staff are paid atomically in a single transaction.
