# 🫙 Jar: tips with no middleman

**Superteam Poland · Finance Without Intermediaries**

**Jar** is a tip jar for restaurant staff with **no owner in it at all**. Guests tip by QR code into a **shift vault controlled only by a
Solana program**. The restaurant never touches the money and has no account, key or role in the program. The team runs the jar itself:
a waiter starts it with their coworkers, **adding or removing anyone needs a majority vote**, and any team member can open a shift. When
the shift ends, each person enters their own hours. Once **more than half of the shift agrees**, anyone can press "Pay out" and the program
splits the pot pro-rata, straight into each person's wallet. If they can't agree in time, the program splits it equally.

- **Live app:** https://jar-tips.vercel.app
- **Program (devnet):** [`HrFcxm1y86UTdeJB7r8khiXfSKXSvf77p7S29MPj2ZSD`](https://explorer.solana.com/address/HrFcxm1y86UTdeJB7r8khiXfSKXSvf77p7S29MPj2ZSD?cluster=devnet) (on-chain name `napiwek`, Polish for "tip")
- **Stack:** Anchor 1.x (Rust) · SPL Token / Token-2022 via `token_interface` · React + Vite · Wallet Adapter (Wallet Standard) · `@anchor-lang/core`
- **Target user:** waiters, bartenders and runners in Polish restaurants and bars where tips arrive by card or QR and are pooled per shift, typically a 5–12-person team whose card tips currently land in the owner's merchant account.

## For judges: try it in 2 minutes

**On a laptop**
1. Open https://jar-tips.vercel.app. The **guide** starts by itself: the page dims and lights up the next thing to click. Reopen it any time with **Guide** in the top bar.
2. **No wallet needed:** on the Overview press **Fund** (free devnet SOL and test USDC), then **Start → Play as Ana**. Ana is a waiter; Ben, Kasia and a guest are also on this laptop. Prefer your own wallet? Connect Phantom or Solflare **on devnet** and you join the team as one more coworker.
3. **Start team**, then try the vote: **Propose someone** (use *Test address*) and press **Ben approves**: 2 of 3 votes adds them.
4. **New shift** → pick who's working → **Open shift as Ana**. On the shift page every button names who it acts as (**Save as Ana**, **Ben agrees**, **Pay out now**). In **Try to cheat**, play the restaurant: withdraw, redirect a share, join the shift. All three fail on-chain.
5. Every notification has an **Explorer** button that opens the transaction on Solana Explorer.

**On a phone**
1. On a shift page, press **Show QR** and scan it.
2. Tap **Open in Phantom** (wallet on devnet), then **get 50 test USDC**, then **Tip**.
3. If the wallet has no devnet SOL for fees, the page links to the free faucet.

**What to look at:** `settle` in [lib.rs:263](programs/napiwek/src/lib.rs#L263) is the only way money leaves a vault. The program has no withdraw instruction, no admin key and no owner field.

---

## Design rationale

### Which relationship?
A guest wants to thank the people who served them. Cash went straight into the waiter's hand. Card and QR tips don't: they're part of
the bill payment, so they settle into the **restaurant's** merchant account, together with the revenue. From there, staff depend on the owner
to pass the money on, on time, split fairly. They have no way to check how much was tipped on their shift.

### Who was the middleman?
The **owner**, with the card acquirer underneath them. The owner holds the tip money and decides who is in the pool, the split, the timing and the
deductions ("card fees", "breakages", "the house share"). Skimming is common enough that the **UK passed the Employment (Allocation of
Tips) Act**, in force since **1 October 2024**, which makes employers pass on 100% of tips. In the US the FLSA bans employers from keeping
tips. Both laws exist because staff can't verify what happens to the money. A law still needs an inspector and a lawsuit. Code doesn't.

### What changes? The owner is gone
Our first version still had an owner who couldn't touch the money but did decide the roster, and so could slip in a fake waiter. This version
removes that role completely. Every job the owner did is now done by the program or by the team itself:

| What the owner used to control | Where it lives now |
|---|---|
| Holding the tips | Each shift's vault is a token account whose only authority is the **shift PDA**. No private key exists for it ([lib.rs:518](programs/napiwek/src/lib.rs#L518)) |
| Taking money out | **There is no such instruction.** The only exit is `settle`, and it can only pay the shift's staff ([lib.rs:273](programs/napiwek/src/lib.rs#L273)) |
| Deciding who's on the team | A **majority vote of the team**: `propose` + `vote`, applied only once more than half approve ([lib.rs:79](programs/napiwek/src/lib.rs#L79), [lib.rs:417](programs/napiwek/src/lib.rs#L417)) |
| Deciding who worked tonight | Any team member opens the shift and can only pick **team members** ([lib.rs:159](programs/napiwek/src/lib.rs#L159)); anyone left out adds **themselves** ([lib.rs:176](programs/napiwek/src/lib.rs#L176)) |
| Deciding who worked how long | Each person submits **their own** minutes, capped at the shift length ([lib.rs:227](programs/napiwek/src/lib.rs#L227)) |
| Approving the split | More than half of the shift must confirm the **exact version** of everyone's hours ([lib.rs:246](programs/napiwek/src/lib.rs#L246), [lib.rs:291](programs/napiwek/src/lib.rs#L291)) |
| Redirecting a share | `settle` checks that every payout account belongs to the person at that position, whoever calls it ([lib.rs:285](programs/napiwek/src/lib.rs#L285)) |
| Deciding when people get paid | `settle` is callable by **anyone** once the rules are met: a waiter, a guest, a bot |

The person who starts the team only pays ~0.007 SOL of rent for the account. They get **no extra rights**: their vote counts once, and
the team can vote them out like anyone else.

### The moment the intermediary disappears
[`settle` in lib.rs:263](programs/napiwek/src/lib.rs#L263). The transfer authority is `ctx.accounts.shift`, a PDA signed with program
seeds. The destinations come from the roster stored on-chain, and the amounts from `split()`. Nothing in that function reads anyone's signature
as permission. In the demo, the restaurant (an outsider keypair) tries three times and every transaction **lands on devnet and fails**:

1. A direct SPL `TransferChecked` out of the vault → `Token program: owner does not match`
2. A real `settle` call with Ana's payout swapped for its own account → `WrongPayoutAccount`
3. `join_shift` to get on the roster → `NotMember`

---

## Rules (who can do what)

| Who | Can | Cannot |
|---|---|---|
| **Team member** | propose adding/removing a coworker, vote on the open proposal, open a shift for team members, add **themselves** to a shift, end a shift they work early, submit **their own** minutes, confirm everyone's hours at a given version | change the team alone, add someone else to a shift, edit someone else's hours, confirm a version that has since changed, withdraw |
| **Guest** | tip any amount into the vault (via `tip`, or by sending tokens to the vault directly; both are shared) | — |
| **Anyone** (incl. the restaurant) | trigger `settle` once the rules allow it | choose who gets paid or how much, join a team or shift, take anything out of a vault |

**Team votes.** One proposal at a time. The proposer's vote counts immediately; it passes when more than half of the current team has
approved (2 of 3, 3 of 4, …). `vote(id)` names the proposal, so nobody can be tricked into approving a different one that replaced it.
Only the proposer can replace an open proposal, or anyone once it's 24 h old, so a stale vote can't block the team.

**Confirmation versioning.** Every hours change or roster addition bumps `shift.version` and voids all earlier confirmations. `confirm(version)` fails
with `StaleVersion` if the numbers changed after you looked, so nobody can be tricked into signing off on edited hours.

**The split.** Majority confirmed → pro-rata by minutes. Rounding dust goes to the longest shift so the vault ends at exactly zero, and it is
then closed so no late tip can get stuck. The rule is mirrored in the UI's live preview (`app/src/solana.ts`).

## What happens if someone vanishes halfway?

| Situation | Where the money is | What happens |
|---|---|---|
| Whoever opened the shift disappears | In the vault (PDA) | Nothing changes. The shift closes at its scheduled end on its own; the others confirm and anyone pays out. |
| Nobody ends the shift | In the vault | `closes_at` was fixed at opening (scheduled length). After it, the shift is over by definition. |
| Someone was left off the shift | In the vault | If they're on the team, they add themselves with `join_shift`, which resets confirmations so everyone re-checks. |
| One waiter never confirms | In the vault | Only a majority is needed. Their share is still paid to them by the hours they submitted (0 if they didn't). |
| Nobody agrees / everyone vanishes | In the vault | After `closes_at + confirm_window`, **anyone** can settle and the pot is split **equally** across the shift. Nobody can hold it hostage. |
| A waiter closed their token account | In the vault | The client recreates it idempotently before `settle`, so a payout can't be blocked. |
| A guest tips after payout | Their own wallet | The vault was closed in `settle`, so the transfer fails instead of stranding funds. |
| Someone pre-creates the next vault address to block a shift | — | `open_shift` uses `init_if_needed` and only accepts the shift's own token account; anything already in it is shared like a tip. |

## Can anything be changed after deploy?
- **Per shift:** no. Mint, roster (add-only, team members only), shift length, confirm window and the split rule are fixed when the shift opens.
- **Per team:** only membership, and only by majority vote. Mint and confirm window are fixed when the team starts.
- **The program:** right now it's upgradeable by the deployer key `5S94…fXe` (to fix bugs during the hackathon). Before judging it will be made **immutable**:
  ```bash
  solana program set-upgrade-authority HrFcxm1y86UTdeJB7r8khiXfSKXSvf77p7S29MPj2ZSD --final
  ```
  After that, nobody can change the rules, including us. You can verify the upgrade authority on Explorer.
- **No admin key, no pause, no fee switch** exists in the code.

## Why blockchain and not a database?
A tip-splitting app on a database (several exist) still has an operator who holds the money and can change the numbers. The owner can
"fix" a row, and staff can't prove otherwise. Here:
- **Custody:** the money sits in an account that only the program can sign for. There is no company holding it and no bank account to freeze.
- **Verifiability:** every tip, every vote, every hours entry, every confirmation and every payout is a public transaction. A waiter can check the shift total
  with a block explorer, without trusting the restaurant or us.
- **Enforcement without courts:** the UK law above needs a tribunal to enforce it. A program rejects the bad transaction before it happens.
- **Cost:** a tip settles for about $0.001 in fees. Card tips often have processing fees deducted before staff ever see them.

## Honest limitations
- **Who starts the team picks its first members.** That's the one moment of trust: the founder could list a fake coworker. It's public,
  the real coworkers see it before working a single shift, and they can vote the fake out as soon as they're a majority. Real identity
  (a venue code printed in the staff room, or a payroll attestation) is on the roadmap.
- **Majority rule is only as honest as the majority.** If most of a team colludes, they can outvote the rest. Hours are peer-checked, and the
  fallback is an equal split, so inflating your own hours doesn't pay.
- **Hours are self-reported**, checked by peers. A greedy waiter can inflate theirs, but the majority won't confirm.
- **Names are on-chain.** First names or nicknames only, max 16 bytes.
- **Pooled tips only.** A QR tips the whole shift, not one waiter. Personal tips (per-waiter QR, 100% to that person) are a planned extension.
- **Demo funding key is public.** `app/src/sponsor-keypair.json` is a devnet-only "gas station" with a little devnet SOL, so judges can play without a wallet. Like the test-USDC faucet key, it's public on purpose and controls nothing in the program.
- **Off-ramp.** Staff receive USDC; turning it into złoty is a separate step (exchange, or a stablecoin card). The demo uses a devnet test USDC with a public faucet.

---

## Demo (live, devnet)

**One laptop plays every role.** Ana, Ben, Kasia, a guest and "the restaurant" (an outsider with no rights) are devnet keypairs kept in the
browser; a connected Phantom/Solflare wallet can join the team too. Buttons name who they act as, and the top bar switches who signs.
The program can't tell them apart from Phantom.

1. **Overview → Fund** (devnet SOL for the demo people, 200 test USDC to the guest)
2. **Team → Play as Ana → Start team** (Ana, Ben, Kasia; time to agree: 1 minute)
3. **Propose someone** → name + *Test address* → **Propose** (1 of 3) → **Ben approves** (2 of 3, added)
4. **New shift** "Friday dinner", 8 h, everyone ticked → **Open shift as Ana**
5. Shift page → step 1 **Tip as Guest** (or **Show QR** and scan it) → tip 10 and 20 USDC
6. **Try to cheat** tab → withdraw, redirect, join → open the Explorer links: **failed on-chain**
7. **End shift as Ana** → enter 8 / 6 / 4 hours → Ana and Ben press **agrees** (2 of 3)
8. **Pay out now** → Ana 13.33 · Ben 10.00 · Kasia 6.67 · restaurant 0 → open in Explorer

Variant: skip step 7's confirmations, wait out the 1-minute window and show the equal-split fallback.

### Verified transactions (devnet)
From the end-to-end script (`app/scripts/e2e-devnet.ts`): team vote to add and remove a coworker, four outsider attacks rejected, 65 USDC tipped, 8 h / 6 h / 4 h.

## Run it

Prerequisites: Node 20+, a devnet wallet with ~0.2 SOL. Program build/deploy needs Rust 1.89, Agave 3.x, Anchor CLI 1.x.

```bash
cd app
npm install
cp .env.example .env.local   # optional: a private devnet RPC, and VITE_PUBLIC_URL for QR codes
npm run dev                  # http://localhost:5174
```

End-to-end check against the deployed program (funds throwaway keypairs from `~/.config/solana/id.json`):

```bash
cd app
npx tsx scripts/e2e-devnet.ts            # majority path
npx tsx scripts/e2e-devnet.ts --timeout  # equal-split fallback
```

Or against a local validator, no devnet SOL needed:

```bash
solana-test-validator --reset --url devnet --clone CuVBzJkeKCsLgCctJjSkQzy5TXyG7QZwhXMFYEVPCaSn \
  --bpf-program HrFcxm1y86UTdeJB7r8khiXfSKXSvf77p7S29MPj2ZSD target/deploy/napiwek.so
solana airdrop 10 -u localhost
cd app && RPC_URL=http://127.0.0.1:8899 npx tsx scripts/e2e-devnet.ts
```

Rebuild and deploy the program:

```bash
anchor build
cargo test -p napiwek                    # split() and majority maths
solana program deploy target/deploy/napiwek.so --program-id target/deploy/napiwek-keypair.json -u devnet
cp target/idl/napiwek.json target/types/napiwek.ts app/src/idl/
```

## Repo map

```
programs/napiwek/src/lib.rs   the whole program: instructions, accounts, split(), votes, errors
app/src/solana.ts             PDAs, instruction builders, status + split preview, activity feed
app/src/actors.tsx            who signs: browser wallet + demo keypairs, send/confirm with retries
app/src/data.ts               polling hooks for the team, shifts and the vault balance
app/src/App.tsx               app shell: rail, top bar, signer switcher, one-at-a-time transactions, toasts
app/src/pages/Overview.tsx    what it is + how to try it
app/src/pages/Team.tsx        start a team, members and votes, open a shift, shift list
app/src/pages/ShiftView.tsx   shift page: summary, four steps with a button per person, tabs (team, QR, try to cheat, activity)
app/src/pages/TipPage.tsx     guest QR tip page (no crypto jargon)
app/src/Tour.tsx              guided spotlight tour (15 steps): dims the page, lights the next control
app/public/icons/             3D illustrations, generated with Higgsfield (GPT Image 2.5)
app/scripts/e2e-devnet.ts     full flow incl. votes and outsider attacks
app/scripts/fund.ts           fund any wallets with devnet SOL + test USDC
app/scripts/check-tx-size.mts proves a 12-person team's transactions fit Solana's 1232-byte limit
```

## From demo to product
- **Who pays:** teams or venues pay a small monthly fee for the app. Never a cut of tips.
- **POS integration:** print the shift QR on the receipt; accept card tips through an on-ramp that settles into the vault as USDC.
- **Staff identity:** join a team with a one-time code from the staff room, so the founder can't invent people; payroll export for tax reporting.
- **Points / roles:** weighted shares (e.g. kitchen 0.5×) voted on by the team and fixed at shift open, visible to everyone before the shift starts.
