# Review in 10 minutes

This page is a route through the project for a technical reviewer. Each step links to the code that backs the claim.

## 1. The claim

> Card and QR tips usually land in the restaurant's merchant account, and staff have to trust the owner to pass them on. Jar takes the owner out completely. Tips go into a vault that only a Solana program can sign for. The team decides who is on it by majority vote, agrees on hours, and anyone can trigger the pro-rata payout.

The restaurant has **no account, key or role** in the program. The code contains no admin key, owner field, pause switch, fee switch or withdraw instruction.

## 2. Try the flow (2 minutes, no wallet needed)

1. Open [jar-tips.vercel.app](https://jar-tips.vercel.app). A guided tour starts on its own. Reopen it any time with **Guide** in the top bar.
2. On the Overview press **Fund**: a bundled devnet "gas station" key sends free devnet SOL and test USDC to the demo people.
3. **Start → Play as Ana**, then **Start team** (Ana, Ben, Kasia).
4. **Propose someone** with *Test address*, then **Ben approves**. 2 of 3 votes adds them.
5. **New shift → Open shift as Ana**. Tip as the guest, or press **Show QR** and scan it with a phone.
6. Open the **Try to cheat** tab. Play the restaurant: withdraw, redirect a share, join the shift. **All three fail on-chain.** Each toast links to the failed transaction on Solana Explorer.
7. **End shift**, enter 8 h / 6 h / 4 h, have Ana and Ben agree (2 of 3), and **Pay out now**. The result is 13.33 / 10.00 / 6.67 USDC, and the restaurant gets 0.

::: tip Every button names its signer
One laptop plays every role. Ana, Ben, Kasia, the guest and the restaurant are throwaway devnet keypairs stored in your browser. The program can't tell them apart from a Phantom wallet. See [Client architecture](/client/architecture).
:::

## 3. Read the five places that matter

| What to check | Where | Why it matters |
|---|---|---|
| The only way money leaves | [`settle` · lib.rs:273](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L273) | The PDA signs the transfers, the destinations come from the on-chain roster, and the caller's identity is never treated as permission. [Walkthrough →](/program/settle) |
| The vault has no private key | [`OpenShift.vault` · lib.rs:514](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L514) | `associated_token::authority = shift`, and the shift is a PDA. [Accounts →](/program/accounts) |
| Team changes need a majority | [`propose` · lib.rs:79](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L79), [`apply_if_passed` · lib.rs:417](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L417) | One open proposal at a time. Votes are stored as a bitmask and the change applies once more than half approve. |
| Nobody approves edited numbers | [`confirm(version)` · lib.rs:246](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L246) | Every hours or roster change bumps `version` and voids earlier confirmations. |
| The split never leaks dust | [`split` · lib.rs:374](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L374) | Floor pro-rata, with the remainder going to the heaviest weight. Unit-tested. [Maths →](/program/maths) |

## 4. Verify it isn't a mock

- The program is **final**: its upgrade authority is `None`. [How to check →](/security/verify#_1-the-program-cannot-be-changed)
- `cargo test -p napiwek` runs the split and majority tests (3 pass).
- `npx tsx app/scripts/e2e-devnet.ts` replays the full flow against the deployed program. It includes **seven forbidden actions** (six by an outsider, one by a member listing an outsider), and each one is rejected. [Details →](/security/verify#_3-replay-the-end-to-end-script)
- `npx tsx app/scripts/check-tx-size.mts` shows that a 12-person team's largest transaction is 970 of 1232 bytes.

## 5. Where it's weak

We list the trust we couldn't remove (who seeds the first roster, majority collusion, self-reported hours) on [Honest limitations](/security/limitations).
