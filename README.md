# 🫙 Jar: tips the owner can't touch

**Superteam Poland · Finance Without Intermediaries**

**Jar** is a tip jar nobody can open but the team. Customers tip by QR code into a **shift vault owned by a Solana program**, not by the restaurant.
When the shift ends, each staff member enters their own hours; once **more than half of the shift has confirmed**, anyone can press
"Pay out" and the program splits the pot pro-rata, straight into each person's wallet. If the staff can't agree in time, the
program splits it equally. **The owner has no withdraw permission at all, because the program has no withdraw instruction.**

- **Live app:** https://jar-tips.vercel.app
- **Program (devnet):** [`APy9737Fhn6SsFCyXeMyHC5hNoagbRMnGp89W3LPH91X`](https://explorer.solana.com/address/APy9737Fhn6SsFCyXeMyHC5hNoagbRMnGp89W3LPH91X?cluster=devnet) (on-chain name `napiwek`, Polish for "tip")
- **Stack:** Anchor 1.x (Rust) · SPL Token / Token-2022 via `token_interface` · React + Vite · Wallet Adapter (Wallet Standard) · `@anchor-lang/core`
- **Target user:** waiters, bartenders and runners in Polish restaurants and bars where tips arrive by card or QR and are pooled per shift, typically a 5–15-person team whose card tips currently land in the owner's merchant account.

## For judges: try it in 2 minutes

**On a laptop**
1. Open https://jar-tips.vercel.app. The **guide** starts by itself: the page dims and lights up the next thing to click. Reopen it any time with **Guide** in the top bar.
2. **No wallet needed:** on the Overview press **Fund demo people** (free devnet SOL and test USDC), then **Go to venue → Play as demo owner**. Prefer your own wallet? Connect Phantom or Solflare **on devnet** (Settings → Developer settings → Testnet mode → Solana Devnet).
3. Every page shows the five-step journey (Create venue → Open a shift → Guests tip → Staff agree → Pay out) with **You are here**, and one **Next step** card. On a shift, the checklist has a button per person (**Save as Ana**, **Ben agrees**, **Pay out now**). In **Owner tools**, try to steal: both attempts fail on-chain.
4. Every notification has an **Explorer** button that opens the transaction on Solana Explorer.

**On a phone**
1. On a shift page, press **Show QR** and scan it.
2. Tap **Open in Phantom** (wallet on devnet), then **get 50 test USDC**, then **Tip**.
3. If the wallet has no devnet SOL for fees, the page links to the free faucet.

**What to look at:** `settle` in [lib.rs:186](programs/napiwek/src/lib.rs#L186) is the only way money leaves a vault, and the program has no withdraw instruction.

---

## Design rationale

### Which relationship?
A guest wants to thank the people who served them. Cash went straight into the waiter's hand. Card and QR tips don't: they're part of
the bill payment, so they settle into the **restaurant's** merchant account, together with the revenue. From there, staff depend on the owner
to pass the money on, on time, split fairly. They have no way to check how much was tipped on their shift.

### Who was the middleman?
The **employer**, with the card acquirer underneath them. The owner holds the tip money and decides the split, the timing and the
deductions ("card fees", "breakages", "the house share"). Skimming is common enough that the **UK passed the Employment (Allocation of
Tips) Act**, in force since **1 October 2024**, which makes employers pass on 100% of tips. In the US the FLSA bans employers from keeping
tips. Both laws exist because staff can't verify what happens to the money. A law still needs an inspector and a lawsuit. Code doesn't.

### What changes?
The owner's job was holding the money and applying the split. Both are now done by the program:

| What the owner used to control | Where it lives now |
|---|---|
| Holding the tips | `open_shift` creates a vault whose only authority is the **shift PDA**. No private key exists for it ([lib.rs:400](programs/napiwek/src/lib.rs#L400)) |
| Taking money out | **There is no such instruction.** The only exit is `settle`, and it can only pay roster members ([lib.rs:196](programs/napiwek/src/lib.rs#L196)) |
| Redirecting a share | `settle` checks every payout account belongs to the staff member at that roster position, whoever calls it ([lib.rs:208](programs/napiwek/src/lib.rs#L208)) |
| Deciding who worked how long | Each person submits **their own** minutes, capped at the shift length ([lib.rs:150](programs/napiwek/src/lib.rs#L150)); the owner can't edit them |
| Approving the split | More than half of the roster must confirm the **exact version** of everyone's hours ([lib.rs:169](programs/napiwek/src/lib.rs#L169), [lib.rs:214](programs/napiwek/src/lib.rs#L214)) |
| Deciding when people get paid | `settle` is callable by **anyone** once the rules are met: a waiter, a guest, a bot |
| Paying themselves | The owner is **rejected from the roster** ([lib.rs:321](programs/napiwek/src/lib.rs#L321)) |

### The moment the intermediary disappears
[`settle` in lib.rs:186–283](programs/napiwek/src/lib.rs#L186). The transfer authority is `ctx.accounts.shift`, a PDA signed with program
seeds. The destinations come from the roster stored on-chain, and the amounts from `split()`. Nothing in that function reads a signature from the owner.
In the demo, the owner tries twice and both transactions **land on devnet and fail** (links below):

1. A direct SPL `TransferChecked` out of the vault → `Token program: owner does not match`
2. A real `settle` call with Ana's payout swapped for the owner's account → `WrongPayoutAccount`

---

## Rules (who can do what)

| Who | Can | Cannot |
|---|---|---|
| **Owner** | create the venue (pick the tip currency + confirm window), open a shift with a roster, **add** staff while the shift runs, end a shift early | withdraw, edit hours, confirm, remove anyone, be on the roster, choose payout accounts, change the split rule |
| **Staff member** | submit/update **their own** minutes (≤ shift length), confirm everyone's hours at a given version | edit someone else's hours, confirm a version that has since changed |
| **Guest** | tip any amount into the vault (via `tip`, or by sending tokens to the vault directly; both are shared) | — |
| **Anyone** | trigger `settle` once the rules allow it | choose who gets paid or how much |

**Confirmation versioning.** Every hours change or roster addition bumps `shift.version` and voids all earlier confirmations. `confirm(version)` fails
with `StaleVersion` if the numbers changed after you looked, so nobody can be tricked into signing off on edited hours.

**The split.** Majority confirmed → pro-rata by minutes. Rounding dust goes to the longest shift so the vault ends at exactly zero, and it is
then closed so no late tip can get stuck. The rule is mirrored in the UI's live preview (`app/src/solana.ts`).

## What happens if someone vanishes halfway?

| Situation | Where the money is | What happens |
|---|---|---|
| Owner disappears after opening the shift | In the vault (PDA) | Nothing changes. The shift closes at its scheduled end on its own; staff confirm and anyone pays out. The owner is never needed again. |
| Owner refuses to end the shift | In the vault | `closes_at` was fixed at opening (scheduled length). After it, the shift is over by definition. |
| One waiter never confirms | In the vault | Only a majority is needed. Their share is still paid to them by the hours they submitted (0 if they didn't). |
| Nobody agrees / everyone vanishes | In the vault | After `closes_at + confirm_window`, **anyone** can settle and the pot is split **equally** across the roster. Nobody can hold it hostage. |
| A waiter closed their token account | In the vault | The client recreates it idempotently in the same `settle` transaction, so a payout can't be blocked. |
| A guest tips after payout | Their own wallet | The vault was closed in `settle`, so the transfer fails instead of stranding funds. |

## Can anything be changed after deploy?
- **Per shift:** no. Mint, roster (add-only), shift length, confirm window and the split rule are fixed when the shift opens.
- **The program:** right now it's upgradeable by the deployer key `5S94…fXe` (to fix bugs during the hackathon). Before judging it will be made **immutable**:
  ```bash
  solana program set-upgrade-authority APy9737Fhn6SsFCyXeMyHC5hNoagbRMnGp89W3LPH91X --final
  ```
  After that, nobody can change the rules, including us. You can verify the upgrade authority on Explorer.
- **No admin key, no pause, no fee switch** exists in the code.

## Why blockchain and not a database?
A tip-splitting app on a database (several exist) still has an operator who holds the money and can change the numbers. The owner can
"fix" a row, and staff can't prove otherwise. Here:
- **Custody:** the money sits in an account that only the program can sign for. There is no company holding it and no bank account to freeze.
- **Verifiability:** every tip, every hours entry, every confirmation and every payout is a public transaction. A waiter can check the shift total
  with a block explorer, without trusting the owner or us.
- **Enforcement without courts:** the UK law above needs a tribunal to enforce it. A program rejects the bad transaction before it happens.
- **Cost:** a tip settles for about $0.001 in fees. Card tips often have processing fees deducted before staff ever see them.

## Honest limitations
- **The roster is declared by the owner.** That's the one fact only the employer knows. Mitigations: it's public and add-only, the owner can't be on it,
  and adding a "phantom" waiter leaves permanent evidence. Real staff can see it and refuse to confirm. Stronger identity (staff self-register
  with a venue code) is on the roadmap.
- **Hours are self-reported**, checked by peers. A greedy waiter can inflate theirs, but the majority won't confirm, and the fallback is an equal split, so inflating doesn't pay.
- **Names are on-chain.** First names or nicknames only, max 16 bytes.
- **Known issue, fixed in the next upgrade:** the next shift's vault address is predictable, so a griefer could create that token account
  first and make `open_shift` fail for that venue (`init` requires a fresh account). The fix is `init_if_needed` on the vault. It's safe because
  the account's only authority is still the shift PDA. Funds are never at risk; it only blocks opening new shifts.
- **Pooled tips only.** A QR tips the whole shift, not one waiter. Personal tips (per-waiter QR, 100% to that person) are a planned extension.
- **Demo funding key is public.** `app/src/sponsor-keypair.json` is a devnet-only "gas station" with a little devnet SOL, so judges can play without a wallet. Like the test-USDC faucet key, it's public on purpose and controls nothing in the program.
- **Off-ramp.** Staff receive USDC; turning it into złoty is a separate step (exchange, or a stablecoin card). The demo uses a devnet test USDC with a public faucet.

---

## Demo (live, devnet)

**One laptop plays every role.** The connected browser wallet (Phantom/Solflare on devnet) is the **owner**. Ana, Ben, Kasia and a Guest are
devnet keypairs kept in the browser. You pick who signs from **Signing as** at the bottom of the sidebar. The program can't tell them apart from Phantom.
*Demo owner* is a backup in case the browser wallet misbehaves on stage.

1. **Overview → Fund demo wallets** (0.02 SOL to each low wallet, 200 test USDC to the guest)
2. **Venue → Create venue** (time to agree: 1 minute) → **New shift** "Friday dinner", 8 h, *Use demo crew* → **Open shift**
3. Shift page → step 1 **Tip as Guest** (or **Show QR** and scan it) → tip 10 and 20 USDC
4. Back on the shift page → **Owner tools** tab → both "try to steal" buttons → open the Explorer links: **failed on-chain**
5. **End shift** → sign as Ana / Ben / Kasia → enter 8 / 6 / 4 hours → Ana and Ben press **I agree** (2 of 3)
6. Sign as **Guest** (not staff, not owner) → **Pay out now** → Ana 13.33 · Ben 10.00 · Kasia 6.67 · owner +0 → open in Explorer

Variant: skip step 5's confirmations, wait out the 1-minute window and show the equal-split fallback.

### Verified transactions (devnet)
From the end-to-end script (`app/scripts/e2e-devnet.ts`), 65 USDC tipped, 8 h / 6 h / 4 h:
- Payout by a stranger after 2-of-3 confirmation: [`3i9fB5n4…`](https://explorer.solana.com/tx/3i9fB5n4qpZwLubQ9a2JM1p8YLAQeHstpD3tMFN9LPZTHfBDmPpVna1wo6Bv8SPNwHShHb6igKWrmYA2hgFhiA2a?cluster=devnet) → Ana 28.89 · Ben 21.67 · Kasia 14.44 · owner 0
- Equal-split fallback after nobody confirmed: [`4eukakcY…`](https://explorer.solana.com/tx/4eukakcYhjLJ9bbZzH1iJ9NfNu54Hvb1khEM6fw7VLoei5vgK5RxXHuXSqtfTD15u4h93p17f1RhXrqAgGRUqiuL?cluster=devnet) → 21.67 each · owner 0

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

Rebuild and deploy the program:

```bash
anchor build
cargo test -p napiwek                    # split() maths
solana program deploy target/deploy/napiwek.so --program-id target/deploy/napiwek-keypair.json -u devnet
cp target/idl/napiwek.json target/types/napiwek.ts app/src/idl/
```

## Repo map

```
programs/napiwek/src/lib.rs   the whole program: instructions, accounts, split(), errors
app/src/solana.ts             PDAs, instruction builders, status + split preview, activity feed
app/src/actors.tsx            "Signing as": browser wallet + demo keypairs, send/confirm with retries
app/src/data.ts               polling hooks for venue, shifts and the vault balance
app/src/App.tsx               app shell: sidebar, signer switcher, one-at-a-time transactions, toasts
app/src/pages/Overview.tsx    how it works + demo wallets
app/src/pages/Venue.tsx       create venue, open a shift (validated like the program), shift list
app/src/pages/ShiftView.tsx   shift page: status, team + split, your part (staff/owner), tip QR, activity
app/src/pages/TipPage.tsx     guest QR tip page (no crypto jargon)
app/src/Tour.tsx              guided spotlight tour (13 steps): dims the page, lights the next control
app/public/icons/             3D illustrations, generated with Higgsfield (GPT Image 2.5)
app/scripts/e2e-devnet.ts     full flow incl. owner attacks, on devnet
app/scripts/fund.ts           fund any wallets with devnet SOL + test USDC
app/scripts/check-tx-size.mts proves a 12-person shift's transactions fit Solana's 1232-byte limit
```

## From demo to product
- **Who pays:** venues already pay for tip-pool software (tronc tools, POS add-ons). Jar charges per venue per month, never a cut of tips.
- **POS integration:** print the shift QR on the receipt; accept card tips through an on-ramp that settles into the vault as USDC.
- **Staff identity:** staff join a venue with a one-time code, so the owner can't invent people; payroll export for tax reporting.
- **Points / roles:** weighted shares (e.g. kitchen 0.5×) fixed in the venue config at shift open, visible to everyone before the shift starts.
