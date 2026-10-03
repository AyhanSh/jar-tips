# Napiwek: 3-minute video script + live demo checklist

## Before you record / go live
- [ ] `app/.env.local` has a private devnet RPC (`VITE_RPC_URL=…`). The public RPC returns HTTP 429 under demo load.
- [ ] Phantom on **devnet**, owner wallet with ≥ 0.2 SOL. Overview → **Fund demo wallets** done (Ana/Ben/Kasia/Guest have SOL, Guest has USDC).
  No browser wallet? `npx tsx scripts/fund.ts <addresses…>` and sign as Demo owner.
- [ ] Venue already registered with the **1 minute** confirm window, so you don't burn demo time on it.
- [ ] Two tabs ready: the app, and Solana Explorer (devnet).
- [ ] Program made immutable (`solana program set-upgrade-authority APy9737Fhn6SsFCyXeMyHC5hNoagbRMnGp89W3LPH91X --final`), then show "Upgradeable: No" on Explorer.

## Script (≈ 2:50)

**0:00–0:20 · Hook (slide 1–2 or face cam)**
> "When you tip by card, the money doesn't go to your waiter. It lands in the restaurant's account, and the staff have to trust the owner to pass it on. The UK had to pass a law about it in 2024. We replaced the owner's role with a Solana program."

**0:20–0:35 · Who it's for**
> "Napiwek is for waiters, bartenders and runners in Polish restaurants who pool tips per shift. Three people tonight: Ana, Ben and Kasia."

**0:35–1:00 · Owner opens a shift** *(Venue page, connected wallet)*
- **New shift** "Friday dinner", 8 h, *Use demo crew* → **Open shift** → Phantom approves → the shift page opens.
> "This is the last thing the owner controls. The vault you see here belongs to a program address. Nobody holds a key to it."

**1:00–1:25 · Guest tips by QR** *(Tip link → Open tip page, sign as Guest)*
- Tip 20 USDC → thank-you screen → "See the receipt" (Explorer: the destination is the vault, not the owner).
> "No account, no app. The money goes from the guest's wallet straight into the shift vault."

**1:25–1:55 · THE MOMENT: the owner tries to take it** *(back to the shift page, sign as owner → Your part → Try to take the tips)*
- Click **Withdraw … from the vault** → approve → notification "Blocked on-chain: … owner does not match" → **View**: failed tx on Explorer.
- Click **Send Ana's share to me** → "Payout account does not belong to the staff member…" → **View** on Explorer.
> "Both are real transactions. They land on-chain and fail. There's no withdraw instruction in the program, and the payout can only go to the people on the roster."

**1:55–2:25 · Staff confirm** *(End shift → sign as Ana/Ben/Kasia)*
- Ana 8, Ben 6, Kasia 4 hours → Ana **I agree** → Ben **I agree** → "2 of 3 agreed", the payout banner appears.
> "Each person enters only their own hours. If anyone changes a number, every sign-off resets. More than half have to agree."

**2:25–2:45 · Anyone pays out** *(sign as Guest)*
- **Pay out now** → shares appear, Explorer shows three transfers in one transaction. Owner's balance unchanged.
> "Pressed by a guest, not the owner and not us. If nobody had agreed within the window, anyone could trigger an equal split instead, so the pot can't be held hostage."

**2:45–2:55 · Close**
> "Tips belong to the people who earned them. With Napiwek that's a rule, not a promise."

## Likely judge questions: one-line answers
- **Where does the middleman disappear?** `settle` in `programs/napiwek/src/lib.rs:186`. The vault authority is the shift PDA, and payout accounts are checked against the on-chain roster (`:208`).
- **What if someone vanishes?** The money stays in the vault. Majority → split by hours; no majority after the window → anyone triggers an equal split. The owner is never needed after opening.
- **Who can do what?** The owner opens, adds staff and ends early. Staff set their own hours and confirm. Anyone pays out. Nobody can withdraw or redirect.
- **Can you change anything after deploy?** Per shift, no. The program is made immutable with `--final`, which you can check on Explorer.
- **Why not a database?** Whoever runs the database holds the money and can edit the rows. Here no one holds it, and every step is publicly verifiable.
- **Can the owner add a fake waiter?** The roster is public, add-only and visible before anyone confirms. Real staff refuse to confirm, and it's permanent evidence. Staff self-registration is next on the roadmap.
