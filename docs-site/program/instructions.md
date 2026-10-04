# Instructions

Every instruction below is in [`lib.rs`](https://github.com/AyhanSh/jar-tips/blob/main/programs/napiwek/src/lib.rs). The **Checks** column lists every `require!` and Anchor constraint, in the order they run. The client builders live in `app/src/solana.ts` (`ixCreateTeam`, `ixPropose`, …).

## Team

### `create_team(name, confirm_window, members)` {#create-team}

[lib.rs:43](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L43)

| Account | Constraint |
|---|---|
| `creator` | signer, mut (pays rent) |
| `mint` | `mint::token_program = token_program` |
| `team` | `init`, seeds `["team", creator]` |
| `token_program`, `system_program` | |

**Checks:** name 1–32 bytes · `60 ≤ confirm_window ≤ 14 days` · 1–12 members · **the creator is in `members`** · each member name is 1–16 bytes · no duplicate wallets.

**Effect:** writes the team with no proposal. Emits `TeamCreated`.

### `propose(add, wallet, name)` {#propose}

[lib.rs:79](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L79)

| Account | Constraint |
|---|---|
| `member` | signer, must be in `team.members` (`NotMember`) |
| `team` | mut |

**Checks:**
- If a proposal is open: the signer must be its proposer, **or** it must be at least 24 h old (`ProposalPending`). This stops one member from repeatedly replacing a proposal that others are voting on.
- `add`: name 1–16 bytes, team below 12 people, wallet not already a member.
- remove: the wallet is a member, and the team has more than 1 person (`LastMember`).

**Effect:** `proposal_count += 1`. Stores the proposal with `votes = 1 << signer_index`, then runs `apply_if_passed`, so a 1-person team applies it immediately. Emits `Proposed`, and `TeamChanged` if it passes.

### `vote(id)` {#vote}

[lib.rs:115](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L115)

**Checks:** signer is a member · a proposal exists (`NoProposal`) · **`proposal.id == id`** (`WrongProposal`) · it is under 24 h old (`ProposalExpired`).

**Effect:** `votes |= 1 << signer_index`, then `apply_if_passed`. Voting twice has no extra effect.

::: details apply_if_passed: how a passed proposal is applied
[lib.rs:417](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L417). It calls `passes(votes, members.len())`, which counts set bits among the first *n* bits and requires `2·count > n`. On add, it runs `push_member`, which re-checks the cap, the name length and duplicates. On remove, it calls `members.remove(i)`. Then it clears `proposal` and emits `TeamChanged`.

Removing a member shifts the indices of the members after it. Because the proposal is cleared at the same moment, no stored vote mask can end up pointing at the wrong person.
:::

## Shift

### `open_shift(label, scheduled_minutes, workers)` {#open-shift}

[lib.rs:129](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L129)

| Account | Constraint |
|---|---|
| `opener` | signer, mut, must be a team member |
| `team` | mut, `has_one = mint` |
| `mint` | `mint::token_program = token_program` |
| `shift` | `init`, seeds `["shift", team, team.shift_count]` |
| `vault` | **`init_if_needed`**, `associated_token::authority = shift`, same mint and token program |

**Checks:** label ≤ 32 bytes · `1 ≤ scheduled_minutes ≤ 1440` · 1–12 workers · opener is a member · **every worker is a team member** (`NotMember`) · no duplicates.

**Effect:** `closes_at = now + minutes·60`, `version = 1`, and the confirm window is copied from the team. Names are copied from the team, not taken from the caller. `shift_count += 1`. Emits `ShiftOpened`.

::: warning Why `init_if_needed` on the vault
The vault address is predictable. With a plain `init`, an attacker could create that associated token account first and make every `open_shift` fail. `init_if_needed` plus the `associated_token::*` constraints accept an existing account only if it is the shift's own ATA for this mint. Any tokens already in it are paid out like tips.
:::

### `join_shift()` {#join-shift}

[lib.rs:176](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L176)

**Accounts:** `member` (signer), `team`, `shift` (mut, `has_one = team`).

**Checks:** not settled · signer is a team member · not already on the roster.

**Effect:** adds **the signer only**. There is no way to add someone else after opening and no way to remove anyone. `version += 1`. Emits `Joined`.

### `end_shift()` {#end-shift}

[lib.rs:189](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L189)

**Checks:** not settled · signer is on the roster.

**Effect:** `closes_at = min(closes_at, now)`. This can never extend a shift, so nobody can push back the confirm window or the fallback.

### `tip(amount)` {#tip}

[lib.rs:200](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L200)

| Account | Constraint |
|---|---|
| `tipper` | signer, mut |
| `shift` | mut, `has_one = mint` |
| `tipper_token` | `token::mint = mint`, `token::authority = tipper` |
| `vault` | the shift's ATA for the mint |

**Checks:** `amount > 0` · not settled.

**Effect:** CPI `transfer_checked` from the tipper to the vault, signed by the tipper. Increments `total_tipped` (checked add) and `tip_count`. Emits `Tipped`.

## Hours and agreement

### `submit_hours(minutes)` {#submit-hours}

[lib.rs:227](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L227)

**Accounts:** `staff` (signer), `shift` (mut).

**Checks:** not settled · `minutes ≤ scheduled_minutes` (`TooManyMinutes`) · signer is on the roster.

**Effect:** writes **the signer's own** entry only. If the value is unchanged it returns early without bumping `version`, so re-saving doesn't wipe anyone's confirmations. Otherwise it sets `submitted = true` and `version += 1`. Emits `HoursSubmitted`.

### `confirm(version)` {#confirm}

[lib.rs:246](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L246)

**Checks:** not settled · `now ≥ closes_at` (`ShiftStillOpen`) · **`version == shift.version`** (`StaleVersion`) · signer is on the roster.

**Effect:** `staff[i].confirmed_version = version`. Emits `Confirmed { confirmations, roster }`.

## Payout

### `settle()`

The only instruction that moves tokens out of a vault. It has its own page: [settle(): where the middleman disappears](/program/settle).
