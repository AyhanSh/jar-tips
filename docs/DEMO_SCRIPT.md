# Jar: 3-minute video script + live demo checklist

## Before you record / go live
- [ ] Present from https://jar-tips.vercel.app (or localhost with `VITE_PUBLIC_URL=https://jar-tips.vercel.app` in `app/.env.local`, so the QR opens the live site on phones).
- [ ] Phone ready: Phantom on devnet with a little devnet SOL, to scan **Show QR** and tip live.
- [ ] `app/.env.local` has a private devnet RPC (`VITE_RPC_URL=…`). The public RPC returns HTTP 429 under demo load.
- [ ] Overview → **Fund** done (Ana/Ben/Kasia/Guest have SOL, Guest has USDC). No sponsor SOL left? `npx tsx scripts/fund.ts <addresses…>`.
- [ ] Team already started as **Ana** with the **1 minute** confirm window, so you don't burn demo time on it.
- [ ] Two tabs ready: the app, and Solana Explorer (devnet).
- [ ] Program made immutable (`solana program set-upgrade-authority HrFcxm1y86UTdeJB7r8khiXfSKXSvf77p7S29MPj2ZSD --final`), then show "Upgradeable: No" on Explorer.

## Script (≈ 2:55)

**0:00–0:20 · Hook (slide 1–2 or face cam)**
> "When you tip by card, the money doesn't go to your waiter. It lands in the restaurant's account, and the staff have to trust the owner to pass it on. The UK had to pass a law about it in 2024. We took the owner out completely."

**0:20–0:40 · The team runs itself** *(Team page, playing Ana)*
- Show the team: Ana, Ben, Kasia. **Propose someone** → Ola, *Test address* → **Propose** → "1 of 3 votes" → **Ben approves** → Ola is on the team.
> "There's no owner and no admin. Ana started this jar, but she has one vote like everyone else. Adding or removing anyone needs a majority."

**0:40–0:55 · Open a shift** *(**New shift** → "Friday dinner", 8 h, tick who's working → **Open shift as Ana**)*
> "Any team member can open a shift, and only team members can be on it. The vault belongs to a program address. Nobody holds a key to it."

**0:55–1:15 · Guest tips by QR** *(step 1 → **Tip as Guest**, or **Show QR** and scan with a phone)*
- Tip 20 USDC → thank-you screen → "Receipt" (Explorer: the destination is the vault).
> "No account, no app. The money goes from the guest's wallet straight into the shift vault. The restaurant isn't in the path at all."

**1:15–1:50 · THE MOMENT: the restaurant tries anyway** *(shift page → **Try to cheat** tab)*
- **Withdraw … USDC** → "Blocked by the program: owner does not match" → **Explorer**: failed tx.
- **Send Ana's share to me** → "Payout account does not belong to the staff member…".
- **Join this shift** → "Signer is not on this team".
> "Three real transactions from an outsider. They land on-chain and fail. There's no withdraw instruction, payouts only go to the shift's staff, and you can't join a team without its vote."

**1:50–2:20 · Staff agree** *(**End shift as Ana** → step 2 and 3)*
- Ana 8, Ben 6, Kasia 4 hours → **Ana agrees** → **Ben agrees** → "2 of 3 agreed", Pay out opens.
> "Each person enters only their own hours. If anyone changes a number, every sign-off resets. More than half have to agree."

**2:20–2:45 · Anyone pays out**
- **Pay out now** → shares appear, Explorer shows the transfers in one transaction. The restaurant's balance: 0.
> "Anyone can press it, even a guest. If nobody had agreed within the window, anyone could trigger an equal split instead, so the pot can't be held hostage."

**2:45–2:55 · Close**
> "Tips belong to the people who earned them. With Jar that's a rule, not a promise."

## Likely judge questions: one-line answers
- **Where does the middleman disappear?** There's no owner account in the program at all. Money leaves a vault only through `settle` (`programs/napiwek/src/lib.rs:263`): the authority is the shift PDA and payout accounts are checked against the on-chain roster (`:285`).
- **Who decides who's on the team?** The team, by majority vote (`propose` + `vote`). The founder's vote counts once.
- **What stops someone adding a fake coworker?** They can't add anyone alone. A shift can only list team members, and joining a team needs a majority.
- **What if the founder lists a fake at the start?** It's public before anyone works a shift, and the real coworkers can vote it out once they're the majority. Venue-code identity is on the roadmap.
- **What if someone vanishes?** The money stays in the vault. Majority → split by hours; no majority after the window → anyone triggers an equal split. Nobody is needed after the shift opens.
- **Can you change anything after deploy?** Per shift, no. The program is made immutable with `--final`, which you can check on Explorer.
- **Why not a database?** Whoever runs the database holds the money and can edit the rows. Here no one holds it, and every step is publicly verifiable.
