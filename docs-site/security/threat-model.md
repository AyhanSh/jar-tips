# Threat model

## Actors and what they can do

| Actor | Can | Cannot |
|---|---|---|
| **Team member** | propose adding or removing a coworker · vote on the open proposal · open a shift for team members · add **themselves** to a shift · end a shift they work early · submit **their own** minutes · confirm everyone's hours at one version | change the team alone · add someone else to a running shift · edit someone else's hours · confirm a version that has since changed · withdraw |
| **Guest** | tip any amount (via `tip`, or by sending tokens to the vault address; both are shared) | anything else |
| **Anyone, incl. the restaurant** | call `settle` once the rules allow it | choose who is paid or how much · join a team or shift · move anything out of a vault |
| **Team creator** | pays rent and picks the first roster, mint and confirm window | anything a regular member can't. Their vote counts once, and they can be voted out |
| **Us (the developers)** | nothing. The program is final and holds no key of ours | upgrade, pause or drain anything |

## Attacks and how the program stops them

| # | Attack | Mitigation | Where |
|---|---|---|---|
| 1 | Outsider transfers tokens straight out of the vault | The vault's authority is the shift PDA. The Token program rejects any other signer (`owner does not match`) | `OpenShift.vault` |
| 2 | Caller passes their own token account to `settle` | Each remaining account must be owned by the token program, be a token account for the shift's mint, and **belong to the wallet at that roster position** | `settle` step 1 |
| 3 | Caller passes a fake `shift` or `vault` to `settle` | Shift seeds and bump are re-derived. The vault must be `ATA(mint, shift)` under the same token program. `has_one = mint, opened_by` | `Settle` accounts |
| 4 | Outsider joins a shift or votes on the team | `member_index` → `NotMember` | `join_shift`, `vote`, `propose` |
| 5 | Member lists a fake person or an outsider on a shift | `open_shift` accepts only team members, and names are copied from the team | `open_shift` |
| 6 | Member inflates someone else's hours | Only the signer's own entry is writable | `submit_hours` |
| 7 | Member inflates their own hours | Capped at `scheduled_minutes`. Peers must confirm, and without a majority the split falls back to **equal**, so inflating doesn't pay | `submit_hours`, `settle` |
| 8 | Bait and switch: get confirmations, then edit hours | Any edit bumps `version`, which voids every confirmation. `confirm(version)` must match the current version | `submit_hours`, `confirm` |
| 9 | Bait and switch on a team vote: replace the proposal people are approving | `vote(id)` must name the open proposal. Only its proposer can replace it before 24 h | `propose`, `vote` |
| 10 | Stall the payout by never confirming | After `closes_at + confirm_window`, anyone settles with an equal split | `settle` step 2 |
| 11 | Extend the shift to delay the fallback | `end_shift` only moves `closes_at` earlier. `confirm_window` is copied at opening | `end_shift`, `open_shift` |
| 12 | Front-run `open_shift` by creating its vault ATA first | `init_if_needed` accepts the existing account if it is the correct ATA. Any balance in it is shared | `OpenShift.vault` |
| 13 | Block a payout by closing your own token account | The client recreates missing ATAs idempotently before `settle` (`missingAtaIxs`) | client |
| 14 | Tip after payout gets stranded | The vault is closed in `settle`, so a late transfer fails and the guest keeps the funds | `settle` |
| 15 | Settle twice | `settled` flag, and the vault no longer exists | `settle` |
| 16 | Roster too large to settle in one transaction | `MAX_STAFF = 12`. The largest transaction measures 970 of 1232 bytes | `check-tx-size.mts` |
| 17 | Overflow in totals or split | `checked_add` on `total_tipped`, `u128` in `split`, `overflow-checks = true` in release | `tip`, `split` |
| 18 | Lock the team by removing everyone | `LastMember`: a team can't drop to zero | `propose` |
| 19 | Developers change the rules later | Upgrade authority is none (`--final`) | [Verify](/security/verify) |

## Demonstrated live

The app's **Try to cheat** tab runs attacks 1, 2 and 4 as the restaurant keypair. They are sent with `skipPreflight`, so each failure is a real, confirmed devnet transaction with an Explorer link. The end-to-end script runs these and more: outsider votes, outsider opens a shift, a member lists an outsider, outsider withdraws, joins, redirects, and enters hours.

## Out of scope for the program

The program can't stop collusion by a majority of the team, a fake first roster chosen by the creator, or a token issuer's own powers over its mint. These are covered on [Honest limitations](/security/limitations).
