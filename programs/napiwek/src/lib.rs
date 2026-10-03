//! Napiwek (Jar): restaurant tips with no owner and no middleman.
//!
//! Today, card and QR tips land in the restaurant's account and staff have to
//! trust the owner to pass them on and split them fairly. Here the restaurant is
//! not part of the system at all. The people who earn the tips run the jar:
//!
//!   * a team member starts a team with their coworkers -> no owner, no admin key
//!   * adding or removing a coworker                     -> needs a majority of the team
//!   * any team member opens a shift                     -> a vault only this program controls
//!   * customers tip by QR                               -> tokens go straight into the vault
//!   * each person submits their own hours               -> any change resets confirmations
//!   * a majority of the shift confirms the hours        -> ANYONE can trigger the pro-rata split
//!   * nobody reaches a majority before the window       -> ANYONE can trigger an equal split
//!
//! No account has special rights. Whoever creates the team or opens a shift
//! only pays a little rent, and gets that rent back.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("HrFcxm1y86UTdeJB7r8khiXfSKXSvf77p7S29MPj2ZSD");

pub const MAX_STAFF: usize = 12;
pub const MAX_NAME_LEN: usize = 32;
pub const MAX_STAFF_NAME_LEN: usize = 16;
pub const MAX_SHIFT_MINUTES: u16 = 24 * 60;
/// 60 seconds minimum so the "nobody confirmed" fallback can be shown live in a demo.
pub const MIN_CONFIRM_WINDOW: i64 = 60;
pub const MAX_CONFIRM_WINDOW: i64 = 60 * 60 * 24 * 14;
/// After this, anyone on the team may replace a proposal that never passed.
pub const PROPOSAL_TTL: i64 = 60 * 60 * 24;

#[program]
pub mod napiwek {
    use super::*;

    /// A team member starts the team with their coworkers. Fixes the tip currency
    /// and how long people get to agree on hours before the equal split kicks in.
    /// The creator must be on the team and gets no extra rights.
    pub fn create_team(
        ctx: Context<CreateTeam>,
        name: String,
        confirm_window: i64,
        members: Vec<MemberInput>,
    ) -> Result<()> {
        require!(!name.is_empty() && name.len() <= MAX_NAME_LEN, TipError::NameTooLong);
        require!(
            (MIN_CONFIRM_WINDOW..=MAX_CONFIRM_WINDOW).contains(&confirm_window),
            TipError::InvalidWindow
        );
        require!(!members.is_empty() && members.len() <= MAX_STAFF, TipError::InvalidRoster);
        let creator = ctx.accounts.creator.key();
        require!(members.iter().any(|m| m.wallet == creator), TipError::CreatorNotMember);

        let team = &mut ctx.accounts.team;
        team.creator = creator;
        team.mint = ctx.accounts.mint.key();
        team.name = name;
        team.confirm_window = confirm_window;
        team.shift_count = 0;
        team.bump = ctx.bumps.team;
        team.members = Vec::with_capacity(members.len());
        for m in members {
            team.push_member(m.wallet, m.name)?;
        }
        team.proposal_count = 0;
        team.proposal = None;
        emit!(TeamCreated { team: team.key(), members: team.members.len() as u8 });
        Ok(())
    }

    /// A team member proposes adding (`add = true`) or removing a coworker. It
    /// takes effect once more than half the team approves; the proposer's vote
    /// counts right away. One proposal at a time: only its proposer can replace
    /// it, or anyone once it is a day old.
    pub fn propose(ctx: Context<MemberAction>, add: bool, wallet: Pubkey, name: String) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let me = ctx.accounts.member.key();
        let team = &mut ctx.accounts.team;
        let i = team.member_index(&me)?;
        if let Some(p) = &team.proposal {
            require!(
                p.proposer == me || now >= p.created_at.saturating_add(PROPOSAL_TTL),
                TipError::ProposalPending
            );
        }
        if add {
            require!(!name.is_empty() && name.len() <= MAX_STAFF_NAME_LEN, TipError::NameTooLong);
            require!(team.members.len() < MAX_STAFF, TipError::InvalidRoster);
            require!(team.members.iter().all(|m| m.wallet != wallet), TipError::DuplicateStaff);
        } else {
            team.member_index(&wallet)?;
            require!(team.members.len() > 1, TipError::LastMember);
        }
        team.proposal_count += 1;
        team.proposal = Some(Proposal {
            id: team.proposal_count,
            add,
            wallet,
            name: if add { name } else { String::new() },
            proposer: me,
            created_at: now,
            votes: 1 << i,
        });
        emit!(Proposed { team: team.key(), id: team.proposal_count, add, wallet });
        let key = team.key();
        team.apply_if_passed(key)
    }

    /// A team member approves the open proposal. Passing its id means nobody can
    /// be tricked into approving a different proposal that replaced it.
    pub fn vote(ctx: Context<MemberAction>, id: u32) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let team = &mut ctx.accounts.team;
        let i = team.member_index(&ctx.accounts.member.key())?;
        let p = team.proposal.as_mut().ok_or(TipError::NoProposal)?;
        require!(p.id == id, TipError::WrongProposal);
        require!(now < p.created_at.saturating_add(PROPOSAL_TTL), TipError::ProposalExpired);
        p.votes |= 1 << i;
        let key = team.key();
        team.apply_if_passed(key)
    }

    /// Any team member opens a shift for the coworkers working it. Only team
    /// members can be on it, so nobody can slip in a fake name.
    pub fn open_shift(
        ctx: Context<OpenShift>,
        label: String,
        scheduled_minutes: u16,
        workers: Vec<Pubkey>,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(label.len() <= MAX_NAME_LEN, TipError::NameTooLong);
        require!(
            scheduled_minutes > 0 && scheduled_minutes <= MAX_SHIFT_MINUTES,
            TipError::InvalidShiftLength
        );
        require!(!workers.is_empty() && workers.len() <= MAX_STAFF, TipError::InvalidRoster);

        let team = &mut ctx.accounts.team;
        team.member_index(&ctx.accounts.opener.key())?;
        let shift = &mut ctx.accounts.shift;
        shift.team = team.key();
        shift.opened_by = ctx.accounts.opener.key();
        shift.mint = team.mint;
        shift.index = team.shift_count;
        shift.bump = ctx.bumps.shift;
        shift.label = label;
        shift.opened_at = now;
        shift.closes_at = now + scheduled_minutes as i64 * 60;
        shift.scheduled_minutes = scheduled_minutes;
        shift.confirm_window = team.confirm_window;
        shift.version = 1;
        shift.staff = Vec::with_capacity(workers.len());
        for w in workers {
            let m = &team.members[team.member_index(&w)?];
            shift.push_staff(m.wallet, m.name.clone())?;
        }
        team.shift_count += 1;

        emit!(ShiftOpened {
            shift: shift.key(),
            team: shift.team,
            staff: shift.staff.len() as u8,
            closes_at: shift.closes_at,
        });
        Ok(())
    }

    /// A team member who is working but wasn't listed adds themselves (someone
    /// covers, or the opener forgot them). Nobody can add anyone else, and nobody
    /// can be removed. Resets confirmations.
    pub fn join_shift(ctx: Context<JoinShift>) -> Result<()> {
        let team = &ctx.accounts.team;
        let shift = &mut ctx.accounts.shift;
        require!(!shift.settled, TipError::AlreadySettled);
        let m = &team.members[team.member_index(&ctx.accounts.member.key())?];
        shift.push_staff(m.wallet, m.name.clone())?;
        shift.version += 1;
        emit!(Joined { shift: shift.key(), staff: m.wallet });
        Ok(())
    }

    /// Someone working the shift closes it early (kitchen closed). Only ever moves
    /// the end time earlier; a shift also closes by itself at its scheduled end.
    pub fn end_shift(ctx: Context<StaffAction>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let shift = &mut ctx.accounts.shift;
        require!(!shift.settled, TipError::AlreadySettled);
        shift.staff_index(&ctx.accounts.staff.key())?;
        shift.closes_at = shift.closes_at.min(now);
        Ok(())
    }

    /// A customer tips. Tokens move straight from their wallet into the shift
    /// vault; no restaurant account is involved at all.
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
    /// Anyone can call this: a waiter, a bot, a stranger. The caller cannot
    /// choose where the money goes. The payout accounts must be passed in roster
    /// order and each must belong to the staff member at that position; the
    /// vault's only authority is the shift PDA, so this function is the single
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
            shift.team.as_ref(),
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

        // The empty vault is closed so no late tip can get stuck; its rent goes
        // back to whoever paid it when opening the shift. Tips never do.
        token_interface::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.opened_by.to_account_info(),
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

/// More than half of `n` (bits set in `votes` among the first `n`).
pub fn passes(votes: u16, n: usize) -> bool {
    let mask: u32 = (1u32 << n) - 1;
    (votes as u32 & mask).count_ones() as usize * 2 > n
}

impl Team {
    fn push_member(&mut self, wallet: Pubkey, name: String) -> Result<()> {
        require!(self.members.len() < MAX_STAFF, TipError::InvalidRoster);
        require!(!name.is_empty() && name.len() <= MAX_STAFF_NAME_LEN, TipError::NameTooLong);
        require!(self.members.iter().all(|m| m.wallet != wallet), TipError::DuplicateStaff);
        self.members.push(Member { wallet, name });
        Ok(())
    }

    fn member_index(&self, wallet: &Pubkey) -> Result<usize> {
        self.members
            .iter()
            .position(|m| m.wallet == *wallet)
            .ok_or_else(|| error!(TipError::NotMember))
    }

    /// Applies the open proposal once a majority of the current team approves.
    fn apply_if_passed(&mut self, key: Pubkey) -> Result<()> {
        let Some(p) = self.proposal.clone() else { return Ok(()) };
        if !passes(p.votes, self.members.len()) {
            return Ok(());
        }
        if p.add {
            self.push_member(p.wallet, p.name)?;
        } else {
            let i = self.member_index(&p.wallet)?;
            self.members.remove(i);
        }
        self.proposal = None;
        emit!(TeamChanged { team: key, id: p.id, add: p.add, wallet: p.wallet });
        Ok(())
    }
}

impl Shift {
    fn push_staff(&mut self, wallet: Pubkey, name: String) -> Result<()> {
        require!(self.staff.len() < MAX_STAFF, TipError::InvalidRoster);
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
pub struct CreateTeam<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = creator,
        space = 8 + Team::INIT_SPACE,
        seeds = [b"team", creator.key().as_ref()],
        bump,
    )]
    pub team: Account<'info, Team>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MemberAction<'info> {
    /// Must be on the team; checked in the instruction.
    pub member: Signer<'info>,
    #[account(mut)]
    pub team: Account<'info, Team>,
}

#[derive(Accounts)]
pub struct OpenShift<'info> {
    /// Must be on the team; checked in the instruction. Pays the rent, gets it back at payout.
    #[account(mut)]
    pub opener: Signer<'info>,
    #[account(mut, has_one = mint)]
    pub team: Account<'info, Team>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = opener,
        space = 8 + Shift::INIT_SPACE,
        seeds = [b"shift", team.key().as_ref(), team.shift_count.to_le_bytes().as_ref()],
        bump,
    )]
    pub shift: Account<'info, Shift>,
    /// `init_if_needed`: the address is predictable, so someone could create it
    /// first to block the shift. If it exists it must still be the shift's own
    /// account for this mint, and anything already in it is shared like a tip.
    #[account(
        init_if_needed,
        payer = opener,
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
pub struct JoinShift<'info> {
    /// Must be on the team; checked in the instruction.
    pub member: Signer<'info>,
    pub team: Account<'info, Team>,
    #[account(mut, has_one = team)]
    pub shift: Account<'info, Shift>,
}

#[derive(Accounts)]
pub struct StaffAction<'info> {
    /// Must be on the shift's roster; checked in the instruction.
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
        has_one = opened_by,
        has_one = mint,
        seeds = [b"shift", shift.team.as_ref(), shift.index.to_le_bytes().as_ref()],
        bump = shift.bump,
    )]
    pub shift: Account<'info, Shift>,
    /// CHECK: pinned by `has_one = opened_by`; only receives the vault's rent back.
    #[account(mut)]
    pub opened_by: UncheckedAccount<'info>,
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
pub struct Team {
    /// Paid the rent and seeds the address. No special rights.
    pub creator: Pubkey,
    pub mint: Pubkey,
    #[max_len(MAX_NAME_LEN)]
    pub name: String,
    /// Seconds after a shift closes before the equal-split fallback is allowed.
    pub confirm_window: i64,
    pub shift_count: u64,
    pub bump: u8,
    #[max_len(MAX_STAFF)]
    pub members: Vec<Member>,
    pub proposal_count: u32,
    pub proposal: Option<Proposal>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Member {
    pub wallet: Pubkey,
    #[max_len(MAX_STAFF_NAME_LEN)]
    pub name: String,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Proposal {
    pub id: u32,
    /// true: add `wallet` as `name`. false: remove `wallet`.
    pub add: bool,
    pub wallet: Pubkey,
    #[max_len(MAX_STAFF_NAME_LEN)]
    pub name: String,
    pub proposer: Pubkey,
    pub created_at: i64,
    /// Bit i set = members[i] approved.
    pub votes: u16,
}

#[account]
#[derive(InitSpace)]
pub struct Shift {
    pub team: Pubkey,
    /// Paid the rent; gets the vault's rent back at payout. Never paid tips for it.
    pub opened_by: Pubkey,
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
pub struct MemberInput {
    pub wallet: Pubkey,
    pub name: String,
}

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

#[event]
pub struct TeamCreated {
    pub team: Pubkey,
    pub members: u8,
}

#[event]
pub struct Proposed {
    pub team: Pubkey,
    pub id: u32,
    pub add: bool,
    pub wallet: Pubkey,
}

#[event]
pub struct TeamChanged {
    pub team: Pubkey,
    pub id: u32,
    pub add: bool,
    pub wallet: Pubkey,
}

#[event]
pub struct ShiftOpened {
    pub shift: Pubkey,
    pub team: Pubkey,
    pub staff: u8,
    pub closes_at: i64,
}

#[event]
pub struct Joined {
    pub shift: Pubkey,
    pub staff: Pubkey,
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
    #[msg("A team or shift needs between 1 and 12 people")]
    InvalidRoster,
    #[msg("Whoever starts the team must be on it")]
    CreatorNotMember,
    #[msg("This wallet is already listed")]
    DuplicateStaff,
    #[msg("Signer is not on this team")]
    NotMember,
    #[msg("Signer is not on this shift's roster")]
    NotOnRoster,
    #[msg("Another proposal is still open")]
    ProposalPending,
    #[msg("There is no open proposal")]
    NoProposal,
    #[msg("The proposal changed since you looked; review it again")]
    WrongProposal,
    #[msg("The proposal expired")]
    ProposalExpired,
    #[msg("A team can't remove its last member")]
    LastMember,
    #[msg("Tip amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Shift has already been settled")]
    AlreadySettled,
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
    use super::{passes, split};

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

    #[test]
    fn majority_of_the_team() {
        assert!(passes(0b1, 1));
        assert!(!passes(0b01, 2));
        assert!(passes(0b11, 2));
        assert!(!passes(0b001, 3));
        assert!(passes(0b101, 3));
        assert!(!passes(0b0011, 4));
        assert!(passes(0b0111, 4));
        // bits beyond the team size don't count
        assert!(!passes(0b1000_0001, 3));
        assert!(passes(0xFFF, 12));
        assert!(!passes(0b11_1111, 12));
    }
}
