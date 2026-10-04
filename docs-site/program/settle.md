# `settle()`: where the middleman disappears

[lib.rs:263–366](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L263-L366)

`settle` is the **only** code path that moves tokens out of a vault. **Anyone** can call it. The caller is a plain `Signer` that pays the fee, and nothing in the function treats the caller's identity as permission. The caller can't choose who is paid, how much, or when.

## Accounts

```rust
pub struct Settle<'info> {
    pub caller: Signer<'info>,                       // anyone: never used for authorization
    #[account(
        mut,
        has_one = opened_by,
        has_one = mint,
        seeds = [b"shift", shift.team.as_ref(), shift.index.to_le_bytes().as_ref()],
        bump = shift.bump,
    )]
    pub shift: Account<'info, Shift>,                // re-derived: must be a real napiwek shift
    #[account(mut)]
    pub opened_by: UncheckedAccount<'info>,          // pinned by has_one; only receives vault rent
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, associated_token::mint = mint,
              associated_token::authority = shift,
              associated_token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>, // must be THIS shift's vault
    pub token_program: Interface<'info, TokenInterface>,
}
// remaining_accounts: one token account per roster entry, in roster order
```

## The three steps

### 1. Where the money goes is not up to the caller

```rust
let n = shift.staff.len();
require!(ctx.remaining_accounts.len() == n, TipError::WrongPayoutAccount);
for (entry, info) in shift.staff.iter().zip(ctx.remaining_accounts.iter()) {
    require_keys_eq!(*info.owner, ctx.accounts.token_program.key(), TipError::WrongPayoutAccount);
    require!(info.is_writable, TipError::WrongPayoutAccount);
    let account = InterfaceAccount::<TokenAccount>::try_from(info)?;
    require_keys_eq!(account.owner, entry.wallet, TipError::WrongPayoutAccount);
    require_keys_eq!(account.mint, shift.mint, TipError::WrongPayoutAccount);
}
```

For each roster position, the program checks:
- the account is owned by the **same token program** the transfer will use (no fake account owned by another program),
- it deserializes as a real token account,
- its **owner is the wallet at that roster position**,
- its mint is the shift's mint.

The account doesn't have to be an ATA: any token account the staff member owns for this mint is accepted. Swapping in an attacker's account fails with `WrongPayoutAccount`. The demo stages exactly this.

### 2. When it can go

```rust
require!(now >= shift.closes_at, TipError::ShiftStillOpen);
let majority = shift.confirmations() * 2 > n;
if !majority {
    require!(now >= shift.closes_at.saturating_add(shift.confirm_window), TipError::NoMajorityYet);
}
```

- Never while the shift is open.
- With a majority of the **current version** confirmed: allowed immediately.
- Without one: allowed only once the confirm window has passed. Then nobody can hold the pot hostage.

### 3. How it is split

```rust
let total_minutes: u64 = shift.staff.iter().map(|s| s.minutes as u64).sum();
let weights: Vec<u64> = if majority && total_minutes > 0 {
    shift.staff.iter().map(|s| s.minutes as u64).collect()   // pro-rata by minutes
} else {
    vec![1; n]                                                // equal split
};
let pool = ctx.accounts.vault.amount;                         // whatever is in the vault
let shares = split(pool, &weights);
```

The pool is the **vault's real balance**, not `total_tipped`. Tokens sent to the vault address directly, outside `tip`, are shared as well and can't get stuck. See [`split()`](/program/maths) for the rounding rule.

## The transfers: signed by the program, not a person

```rust
let signer_seeds: &[&[&[u8]]] = &[&[b"shift", shift.team.as_ref(), index_bytes.as_ref(), &[shift.bump]]];
for (share, info) in shares.iter().zip(ctx.remaining_accounts.iter()) {
    if *share == 0 { continue; }
    token_interface::transfer_checked(
        CpiContext::new_with_signer(token_program, TransferChecked {
            from: vault, mint, to: info.clone(), authority: shift,     // ← PDA is the authority
        }, signer_seeds),
        *share, mint.decimals,
    )?;
}
token_interface::close_account(/* vault → rent to opened_by, signed by the shift PDA */)?;
```

The transfer authority is `ctx.accounts.shift`, a PDA. Only this program can produce its signature, and it does so only here, towards accounts checked in step 1. After paying out, the now-empty vault is **closed**, and its rent goes back to whoever opened the shift. Any later tip fails with "account not found" instead of being stranded.

Finally it records `staff[i].paid`, `settled = true`, `settled_at`, `by_timeout = !majority` and `paid_out = pool`, and emits `Settled { pool, by_timeout, triggered_by, shares }`.

## Why there is no reentrancy or double-pay

- `settled` is checked first. A second `settle` in a later transaction fails with `AlreadySettled`. In practice the account constraints fail even earlier, because the vault no longer exists.
- Solana's runtime forbids indirect reentrancy (napiwek → token program → napiwek). All transfers and the close are atomic: if any of them fails, the whole transaction reverts.
- `overflow-checks = true` is set in the release profile, and `split` does its maths in `u128`.

## The attack the demo stages

| Attempt by the restaurant (outsider) | What happens on-chain |
|---|---|
| SPL `TransferChecked` straight out of the vault | `Token program: owner does not match`. The vault's authority is the PDA |
| `settle` with Ana's payout swapped for the restaurant's own account | `WrongPayoutAccount` (step 1) |
| `join_shift` to get on the roster | `NotMember` |

The app sends these with `skipPreflight` so they **land on devnet as failed transactions** that you can open in Explorer, instead of being rejected locally by simulation.
