//! Napiwek — a restaurant tip pool the owner cannot touch.
//!
//! Today, card and QR tips land in the owner's account and staff have to trust
//! the owner to pass them on (and to split them fairly). Here, every shift has
//! its own vault whose only authority is a PDA of this program. There is no
//! instruction that pays the owner, and no admin key:
//!
//!   * owner opens a shift with the roster          -> vault created, owner's job is done
//!   * customers tip by QR                          -> tokens go straight into the vault
//!   * each staff member submits their own hours    -> any change resets confirmations
//!   * a majority of the roster confirms the hours  -> ANYONE can trigger the pro-rata split
//!   * nobody reaches a majority before the window  -> ANYONE can trigger an equal split
//!
//! The owner can add people to a running shift (someone covers), but can never
//! remove anyone, never edit hours, never confirm, and never be paid.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("APy9737Fhn6SsFCyXeMyHC5hNoagbRMnGp89W3LPH91X");

pub const MAX_STAFF: usize = 12;
pub const MAX_NAME_LEN: usize = 32;
pub const MAX_STAFF_NAME_LEN: usize = 16;
pub const MAX_SHIFT_MINUTES: u16 = 24 * 60;
/// 60 seconds minimum so the "nobody confirmed" fallback can be shown live in a demo.
pub const MIN_CONFIRM_WINDOW: i64 = 60;
pub const MAX_CONFIRM_WINDOW: i64 = 60 * 60 * 24 * 14;

#[program]
pub mod napiwek {
    use super::*;

    /// One venue per owner wallet. Fixes the tip currency and how long staff get
    /// to agree on hours before the equal-split fallback kicks in.
    pub fn create_venue(ctx: Context<CreateVenue>, name: String, confirm_window: i64) -> Result<()> {
        require!(!name.is_empty() && name.len() <= MAX_NAME_LEN, TipError::NameTooLong);
        require!(
            (MIN_CONFIRM_WINDOW..=MAX_CONFIRM_WINDOW).contains(&confirm_window),
            TipError::InvalidWindow
        );
        let venue = &mut ctx.accounts.venue;
        venue.owner = ctx.accounts.owner.key();
        venue.mint = ctx.accounts.mint.key();
        venue.name = name;
        venue.confirm_window = confirm_window;
        venue.shift_count = 0;
        venue.bump = ctx.bumps.venue;
        Ok(())
    }

    /// Owner opens a shift: who is working and for how long. After this the
    /// owner has no say over the money that lands in the vault.
    pub fn open_shift(
        ctx: Context<OpenShift>,
        label: String,
        scheduled_minutes: u16,
        staff: Vec<StaffInput>,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(label.len() <= MAX_NAME_LEN, TipError::NameTooLong);
        require!(
            scheduled_minutes > 0 && scheduled_minutes <= MAX_SHIFT_MINUTES,
            TipError::InvalidShiftLength
        );
        require!(!staff.is_empty() && staff.len() <= MAX_STAFF, TipError::InvalidRoster);

        let venue = &mut ctx.accounts.venue;
        let shift = &mut ctx.accounts.shift;
        shift.venue = venue.key();
        shift.owner = venue.owner;
        shift.mint = venue.mint;
        shift.index = venue.shift_count;
        shift.bump = ctx.bumps.shift;
        shift.label = label;
        shift.opened_at = now;
        shift.closes_at = now + scheduled_minutes as i64 * 60;
        shift.scheduled_minutes = scheduled_minutes;
        shift.confirm_window = venue.confirm_window;
        shift.version = 1;
        shift.staff = Vec::with_capacity(staff.len());
        for s in staff {
            shift.push_staff(s.wallet, s.name)?;
        }
        venue.shift_count += 1;

        emit!(ShiftOpened {
            shift: shift.key(),
            venue: shift.venue,
            staff: shift.staff.len() as u8,
            closes_at: shift.closes_at,
        });
        Ok(())
    }

    /// Someone covers part of the shift. The owner can only ever ADD people, and
    /// only while the shift is running; nobody can be removed. Resets confirmations.
    pub fn add_staff(ctx: Context<OwnerAction>, wallet: Pubkey, name: String) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let shift = &mut ctx.accounts.shift;
        require!(!shift.settled, TipError::AlreadySettled);
        require!(now < shift.closes_at, TipError::ShiftClosed);
        shift.push_staff(wallet, name)?;
        shift.version += 1;
        Ok(())
    }

    /// Owner closes the shift early (kitchen closed). Only ever moves the end
    /// time earlier; a shift also closes by itself at its scheduled end.
    pub fn end_shift(ctx: Context<OwnerAction>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let shift = &mut ctx.accounts.shift;
        require!(!shift.settled, TipError::AlreadySettled);
        shift.closes_at = shift.closes_at.min(now);
        Ok(())
    }

    /// A customer tips. Tokens move straight from their wallet into the shift
    /// vault; the owner's account is not involved at all.
    pub fn tip(ctx: Context<Tip>, amount: u64) -> Result<()> {
        require!(amount > 0, TipError::ZeroAmount);
        require!(!ctx.accounts.shift.settled, TipError::AlreadySettled);

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.tipper_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.tipper.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        let shift = &mut ctx.accounts.shift;
        shift.total_tipped = shift.total_tipped.checked_add(amount).ok_or(TipError::Overflow)?;
        shift.tip_count += 1;
        emit!(Tipped { shift: shift.key(), tipper: ctx.accounts.tipper.key(), amount });
        Ok(())
    }

    /// A staff member states how long they worked. Only they can set their own
    /// hours, capped at the shift length. Any change invalidates earlier confirmations.
    pub fn submit_hours(ctx: Context<StaffAction>, minutes: u16) -> Result<()> {
        let shift = &mut ctx.accounts.shift;
        require!(!shift.settled, TipError::AlreadySettled);
        require!(minutes <= shift.scheduled_minutes, TipError::TooManyMinutes);
        let i = shift.staff_index(&ctx.accounts.staff.key())?;
        let entry = &mut shift.staff[i];
        if entry.submitted && entry.minutes == minutes {
            return Ok(());
        }
        entry.minutes = minutes;
        entry.submitted = true;
        shift.version += 1;
        emit!(HoursSubmitted { shift: shift.key(), staff: ctx.accounts.staff.key(), minutes });
        Ok(())
    }

    /// A staff member signs off on everyone's hours exactly as they are at
    /// `version`. Passing the version means nobody can be tricked into approving
    /// numbers that changed after they looked.
    pub fn confirm(ctx: Context<StaffAction>, version: u32) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let shift = &mut ctx.accounts.shift;
        require!(!shift.settled, TipError::AlreadySettled);
        require!(now >= shift.closes_at, TipError::ShiftStillOpen);
        require!(version == shift.version, TipError::StaleVersion);
        let i = shift.staff_index(&ctx.accounts.staff.key())?;
        shift.staff[i].confirmed_version = version;
        emit!(Confirmed {
            shift: shift.key(),
            staff: ctx.accounts.staff.key(),
            confirmations: shift.confirmations() as u8,
            roster: shift.staff.len() as u8,
        });
        Ok(())
    }

    /// THE MOMENT THE INTERMEDIARY DISAPPEARS.
    ///
    /// Anyone can call this: a waiter, a bot, the owner, a stranger. The caller
    /// cannot choose where the money goes. The payout accounts must be passed in
    /// roster order and each must belong to the staff member at that position;
    /// the vault's only authority is the shift PDA, so this function is the single
    /// exit door for tips.
    ///
    ///   * majority of the roster confirmed the current hours -> split pro-rata by minutes
    ///   * no majority, confirm window passed                 -> split equally (nobody stalls the pot)
    pub fn settle<'info>(ctx: Context<'info, Settle<'info>>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let shift = &ctx.accounts.shift;
        require!(!shift.settled, TipError::AlreadySettled);

        // 1. Where the money goes is not up to the caller.
        let n = shift.staff.len();
        require!(ctx.remaining_accounts.len() == n, TipError::WrongPayoutAccount);
        for (entry, info) in shift.staff.iter().zip(ctx.remaining_accounts.iter()) {
            require_keys_eq!(*info.owner, ctx.accounts.token_program.key(), TipError::WrongPayoutAccount);
            require!(info.is_writable, TipError::WrongPayoutAccount);
            let account = InterfaceAccount::<TokenAccount>::try_from(info)?;
            require_keys_eq!(account.owner, entry.wallet, TipError::WrongPayoutAccount);
            require_keys_eq!(account.mint, shift.mint, TipError::WrongPayoutAccount);
        }

        // 2. When it can go.
        require!(now >= shift.closes_at, TipError::ShiftStillOpen);
        let majority = shift.confirmations() * 2 > n;
        if !majority {
            require!(
                now >= shift.closes_at.saturating_add(shift.confirm_window),
                TipError::NoMajorityYet
            );
        }

        // 3. How it is split. The pool is whatever sits in the vault, so tokens
        //    sent outside the `tip` instruction are shared too.
        let total_minutes: u64 = shift.staff.iter().map(|s| s.minutes as u64).sum();
        let weights: Vec<u64> = if majority && total_minutes > 0 {
            shift.staff.iter().map(|s| s.minutes as u64).collect()
        } else {
            vec![1; n]
        };
        let pool = ctx.accounts.vault.amount;
        let shares = split(pool, &weights);

        let index_bytes = shift.index.to_le_bytes();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"shift",
            shift.venue.as_ref(),
            index_bytes.as_ref(),
            &[shift.bump],
        ]];
        for (share, info) in shares.iter().zip(ctx.remaining_accounts.iter()) {
            if *share == 0 {
                continue;
            }
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.vault.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                        to: info.clone(),
                        authority: ctx.accounts.shift.to_account_info(),
                    },
                    signer_seeds,
                ),
                *share,
                ctx.accounts.mint.decimals,
            )?;
        }

        // The empty vault is closed so no late tip can get stuck; its rent
        // (paid by the owner when opening the shift) goes back to the owner.
        token_interface::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.owner.to_account_info(),
                authority: ctx.accounts.shift.to_account_info(),
            },
            signer_seeds,
        ))?;

        let shift = &mut ctx.accounts.shift;
        for (entry, share) in shift.staff.iter_mut().zip(shares.iter()) {
            entry.paid = *share;
        }
        shift.settled = true;
        shift.settled_at = now;
        shift.by_timeout = !majority;
        shift.paid_out = pool;
        emit!(Settled {
            shift: shift.key(),
            pool,
            by_timeout: !majority,
            triggered_by: ctx.accounts.caller.key(),
            shares,
        });
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/// Pro-rata split by integer weights. Rounding dust goes to the heaviest
/// weight (first one on a tie), so the vault always ends at exactly zero.
pub fn split(pool: u64, weights: &[u64]) -> Vec<u64> {
    let total: u128 = weights.iter().map(|w| *w as u128).sum();
    if total == 0 || weights.is_empty() {
        return vec![0; weights.len()];
    }
    let mut shares: Vec<u64> = weights
        .iter()
        .map(|w| (pool as u128 * *w as u128 / total) as u64)
        .collect();
    let dust = pool - shares.iter().sum::<u64>();
    let mut top = 0;
    for (i, w) in weights.iter().enumerate() {
        if *w > weights[top] {
            top = i;
        }
    }
    shares[top] += dust;
    shares
}

impl Shift {
    fn push_staff(&mut self, wallet: Pubkey, name: String) -> Result<()> {
        require!(self.staff.len() < MAX_STAFF, TipError::InvalidRoster);
        require!(name.len() <= MAX_STAFF_NAME_LEN, TipError::NameTooLong);
        require_keys_neq!(wallet, self.owner, TipError::OwnerOnRoster);
        require!(
            self.staff.iter().all(|s| s.wallet != wallet),
            TipError::DuplicateStaff
        );
        self.staff.push(StaffEntry {
            wallet,
            name,
            minutes: 0,
            submitted: false,
            confirmed_version: 0,
            paid: 0,
        });
        Ok(())
    }

    fn staff_index(&self, wallet: &Pubkey) -> Result<usize> {
        self.staff
            .iter()
            .position(|s| s.wallet == *wallet)
            .ok_or_else(|| error!(TipError::NotOnRoster))
    }

    fn confirmations(&self) -> usize {
        self.staff
            .iter()
            .filter(|s| s.confirmed_version == self.version)
            .count()
    }
}

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct CreateVenue<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = owner,
        space = 8 + Venue::INIT_SPACE,
        seeds = [b"venue", owner.key().as_ref()],
        bump,
    )]
    pub venue: Account<'info, Venue>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OpenShift<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        has_one = owner @ TipError::Unauthorized,
        has_one = mint,
        seeds = [b"venue", owner.key().as_ref()],
        bump = venue.bump,
    )]
    pub venue: Account<'info, Venue>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = owner,
        space = 8 + Shift::INIT_SPACE,
        seeds = [b"shift", venue.key().as_ref(), venue.shift_count.to_le_bytes().as_ref()],
        bump,
    )]
    pub shift: Account<'info, Shift>,
    #[account(
        init,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = shift,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OwnerAction<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner @ TipError::Unauthorized)]
    pub shift: Account<'info, Shift>,
}

#[derive(Accounts)]
pub struct StaffAction<'info> {
    /// Must be on the roster; checked in the instruction.
    pub staff: Signer<'info>,
    #[account(mut)]
    pub shift: Account<'info, Shift>,
}

#[derive(Accounts)]
pub struct Tip<'info> {
    #[account(mut)]
    pub tipper: Signer<'info>,
    #[account(mut, has_one = mint)]
    pub shift: Account<'info, Shift>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = tipper,
        token::token_program = token_program,
    )]
    pub tipper_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = shift,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Remaining accounts: one token account per roster entry, in roster order,
/// each owned by that staff member's wallet. Nothing else is accepted.
#[derive(Accounts)]
pub struct Settle<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        has_one = owner,
        has_one = mint,
        seeds = [b"shift", shift.venue.as_ref(), shift.index.to_le_bytes().as_ref()],
        bump = shift.bump,
    )]
    pub shift: Account<'info, Shift>,
    /// CHECK: pinned by `has_one = owner`; only receives the vault's rent back.
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = shift,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Venue {
    pub owner: Pubkey,
    pub mint: Pubkey,
    #[max_len(MAX_NAME_LEN)]
    pub name: String,
    /// Seconds after the shift closes before the equal-split fallback is allowed.
    pub confirm_window: i64,
    pub shift_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Shift {
    pub venue: Pubkey,
    /// Stored only to pin the rent refund and the owner-only actions. Never paid tips.
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub index: u64,
    pub bump: u8,
    #[max_len(MAX_NAME_LEN)]
    pub label: String,
    pub opened_at: i64,
    pub closes_at: i64,
    pub scheduled_minutes: u16,
    pub confirm_window: i64,
    /// Bumped on every roster or hours change; confirmations are for one version.
    pub version: u32,
    pub total_tipped: u64,
    pub tip_count: u32,
    pub settled: bool,
    pub settled_at: i64,
    pub by_timeout: bool,
    pub paid_out: u64,
    #[max_len(MAX_STAFF)]
    pub staff: Vec<StaffEntry>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct StaffEntry {
    pub wallet: Pubkey,
    #[max_len(MAX_STAFF_NAME_LEN)]
    pub name: String,
    pub minutes: u16,
    pub submitted: bool,
    pub confirmed_version: u32,
    pub paid: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StaffInput {
    pub wallet: Pubkey,
    pub name: String,
}

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

#[event]
pub struct ShiftOpened {
    pub shift: Pubkey,
    pub venue: Pubkey,
    pub staff: u8,
    pub closes_at: i64,
}

#[event]
pub struct Tipped {
    pub shift: Pubkey,
    pub tipper: Pubkey,
    pub amount: u64,
}

#[event]
pub struct HoursSubmitted {
    pub shift: Pubkey,
    pub staff: Pubkey,
    pub minutes: u16,
}

#[event]
pub struct Confirmed {
    pub shift: Pubkey,
    pub staff: Pubkey,
    pub confirmations: u8,
    pub roster: u8,
}

#[event]
pub struct Settled {
    pub shift: Pubkey,
    pub pool: u64,
    pub by_timeout: bool,
    pub triggered_by: Pubkey,
    pub shares: Vec<u64>,
}

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum TipError {
    #[msg("Name is empty or too long")]
    NameTooLong,
    #[msg("Confirm window out of range")]
    InvalidWindow,
    #[msg("Shift length must be 1 minute to 24 hours")]
    InvalidShiftLength,
    #[msg("A shift needs between 1 and 12 staff")]
    InvalidRoster,
    #[msg("The owner cannot be on the tip roster")]
    OwnerOnRoster,
    #[msg("This wallet is already on the roster")]
    DuplicateStaff,
    #[msg("Signer is not on this shift's roster")]
    NotOnRoster,
    #[msg("Only the owner can do this")]
    Unauthorized,
    #[msg("Tip amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Shift has already been settled")]
    AlreadySettled,
    #[msg("Shift is closed")]
    ShiftClosed,
    #[msg("Shift is still running")]
    ShiftStillOpen,
    #[msg("More minutes than the shift lasted")]
    TooManyMinutes,
    #[msg("Hours changed since you looked; review them again")]
    StaleVersion,
    #[msg("No majority yet and the confirm window is still open")]
    NoMajorityYet,
    #[msg("Payout account does not belong to the staff member at that position")]
    WrongPayoutAccount,
}

#[cfg(test)]
mod tests {
    use super::split;

    #[test]
    fn splits_pro_rata_without_losing_dust() {
        let s = split(100_000_001, &[480, 360, 240]);
        assert_eq!(s.iter().sum::<u64>(), 100_000_001);
        assert_eq!(s, vec![44_444_446, 33_333_333, 22_222_222]);
    }

    #[test]
    fn equal_split_and_zero_pool() {
        assert_eq!(split(10, &[1, 1, 1]), vec![4, 3, 3]);
        assert_eq!(split(0, &[5, 5]), vec![0, 0]);
        assert_eq!(split(7, &[0, 0]), vec![0, 0]);
    }
}
