# Program overview

| | |
|---|---|
| **Program ID** | [`HrFcxm1y86UTdeJB7r8khiXfSKXSvf77p7S29MPj2ZSD`](https://explorer.solana.com/address/HrFcxm1y86UTdeJB7r8khiXfSKXSvf77p7S29MPj2ZSD?cluster=devnet) |
| **Name** | `napiwek` (Polish for "tip") |
| **Cluster** | devnet |
| **Loader** | BPF upgradeable loader, **upgrade authority: none** (final) |
| **Framework** | Anchor 1.x, Rust 1.89 |
| **Token support** | Any mint under SPL Token or Token-2022, via `anchor_spl::token_interface`. The demo uses a classic SPL test USDC (`CuVBzJ…CaSn`, 6 decimals) |
| **Source** | [`programs/napiwek/src/lib.rs`](https://github.com/AyhanSh/jar-tips/blob/main/programs/napiwek/src/lib.rs), one file |

## Instruction map

| Instruction | Signer must be | Effect |
|---|---|---|
| [`create_team`](/program/instructions#create-team) | on the member list | Creates the Team PDA and fixes the mint and confirm window |
| [`propose`](/program/instructions#propose) | team member | Opens an add/remove proposal. The proposer's vote counts immediately |
| [`vote`](/program/instructions#vote) | team member | Approves proposal `id` and applies it at more than half |
| [`open_shift`](/program/instructions#open-shift) | team member | Creates the Shift PDA and its vault with a roster of team members |
| [`join_shift`](/program/instructions#join-shift) | team member | Adds **the signer** to the roster and bumps `version` |
| [`end_shift`](/program/instructions#end-shift) | on the roster | Moves `closes_at` earlier, never later |
| [`tip`](/program/instructions#tip) | anyone | Transfers tokens from the signer into the vault |
| [`submit_hours`](/program/instructions#submit-hours) | on the roster | Sets **the signer's** minutes and bumps `version` |
| [`confirm`](/program/instructions#confirm) | on the roster | Approves everyone's hours at exactly `version` |
| [`settle`](/program/settle) | **anyone** | Pays out pro-rata or equally, then closes the vault |

## Constants

| Constant | Value | Purpose |
|---|---|---|
| `MAX_STAFF` | 12 | Team and shift size cap. Keeps accounts fixed-size and `settle` inside one transaction |
| `MAX_NAME_LEN` | 32 bytes | Team name, shift label |
| `MAX_STAFF_NAME_LEN` | 16 bytes | Person's name (bytes, not characters: "ł" is 2) |
| `MAX_SHIFT_MINUTES` | 1440 | Shift length is 1 minute to 24 hours |
| `MIN_CONFIRM_WINDOW` | 60 s | Short enough to show the equal-split fallback live in a demo |
| `MAX_CONFIRM_WINDOW` | 14 days | |
| `PROPOSAL_TTL` | 24 h | After this, any member may replace a stuck proposal, and it can no longer be voted on |

## What is deliberately *not* in the program

- No `withdraw`, `sweep`, `close_shift` or `emergency` instruction.
- No admin, owner, authority or fee-recipient field on any account.
- No instruction that edits another person's hours or removes someone from a shift.
- No upgrade path: the upgrade authority was set to none with `--final`.
