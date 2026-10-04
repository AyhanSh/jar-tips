# Failure modes

What happens to the money when people disappear or things go wrong. In every row, the money is in a vault that **no person** can move, and a path to payout exists that doesn't depend on any particular person.

| Situation | Where the money is | What happens |
|---|---|---|
| Whoever opened the shift disappears | Vault (PDA) | Nothing changes. The shift closes at its scheduled end on its own. The others confirm, and anyone pays out. The opener still receives their own share and the vault rent |
| Nobody ends the shift | Vault | `closes_at` was fixed at opening. After it passes, the shift is over by definition |
| Someone was left off the shift | Vault | If they're on the team, they add themselves with `join_shift`. This bumps `version`, so everyone re-checks |
| One waiter never confirms | Vault | Only a majority is needed. Their share is still paid by the hours they submitted (0 if they didn't) |
| Nobody agrees, or everyone vanishes | Vault | After `closes_at + confirm_window`, **anyone** can settle, and the pot is split **equally**. Nobody can hold it hostage |
| A waiter closed their token account | Vault | The client recreates it idempotently before `settle`, so a payout can't be blocked |
| A guest tips after payout | Their own wallet | The vault was closed in `settle`, so the transfer fails instead of stranding funds |
| Someone pre-creates the next vault address to block a shift | — | `open_shift` uses `init_if_needed` and accepts only the shift's own token account. Anything already in it is shared like a tip |
| A team proposal stalls | — | After 24 h it can't be voted on, and any member can replace it |
| Our website goes offline | Vault | The program doesn't need us. Any client (a script, Explorer tooling, another app) can call `settle` with the public IDL |
| Devnet drops a transaction | — | The client re-broadcasts the same signed bytes every 2 s until it confirms or the blockhash expires. A signature can land only once |

## Can anything be changed after deploy?

- **Per shift:** no. The mint, roster (add-only, team members only), shift length, confirm window and split rule are fixed when the shift opens.
- **Per team:** only membership, and only by majority vote. The mint and confirm window are fixed when the team starts.
- **The program:** no. It is final, so nobody can change the rules, including us.
- No admin key, pause or fee switch exists in the code.
