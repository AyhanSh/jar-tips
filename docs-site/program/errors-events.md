# Errors and events

## Errors (`TipError`)

Anchor custom error codes start at 6000, in declaration order ([lib.rs:763](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L763)).

| Code | Name | Message | Raised by |
|---|---|---|---|
| 6000 | `NameTooLong` | Name is empty or too long | create_team, propose, open_shift |
| 6001 | `InvalidWindow` | Confirm window out of range | create_team |
| 6002 | `InvalidShiftLength` | Shift length must be 1 minute to 24 hours | open_shift |
| 6003 | `InvalidRoster` | A team or shift needs between 1 and 12 people | create_team, propose, open_shift, join_shift |
| 6004 | `CreatorNotMember` | Whoever starts the team must be on it | create_team |
| 6005 | `DuplicateStaff` | This wallet is already listed | create_team, propose, open_shift, join_shift |
| 6006 | `NotMember` | Signer is not on this team | propose, vote, open_shift, join_shift |
| 6007 | `NotOnRoster` | Signer is not on this shift's roster | end_shift, submit_hours, confirm |
| 6008 | `ProposalPending` | Another proposal is still open | propose |
| 6009 | `NoProposal` | There is no open proposal | vote |
| 6010 | `WrongProposal` | The proposal changed since you looked; review it again | vote |
| 6011 | `ProposalExpired` | The proposal expired | vote |
| 6012 | `LastMember` | A team can't remove its last member | propose |
| 6013 | `ZeroAmount` | Tip amount must be greater than zero | tip |
| 6014 | `Overflow` | Arithmetic overflow | tip |
| 6015 | `AlreadySettled` | Shift has already been settled | join_shift, end_shift, tip, submit_hours, confirm, settle |
| 6016 | `ShiftStillOpen` | Shift is still running | confirm, settle |
| 6017 | `TooManyMinutes` | More minutes than the shift lasted | submit_hours |
| 6018 | `StaleVersion` | Hours changed since you looked; review them again | confirm |
| 6019 | `NoMajorityYet` | No majority yet and the confirm window is still open | settle |
| 6020 | `WrongPayoutAccount` | Payout account does not belong to the staff member at that position | settle |

The app turns failed transaction logs into one sentence with `explainFailure` (`app/src/solana.ts`). For the raw Token-program rejection, that sentence is: *"the vault belongs to the program, not to you"*.

## Events

Emitted with Anchor's `emit!` (base64 `Program data:` log lines), decodable with the IDL.

| Event | Fields | Emitted by |
|---|---|---|
| `TeamCreated` | `team`, `members: u8` | create_team |
| `Proposed` | `team`, `id`, `add`, `wallet` | propose |
| `TeamChanged` | `team`, `id`, `add`, `wallet` | propose / vote when a proposal passes |
| `ShiftOpened` | `shift`, `team`, `staff: u8`, `closes_at` | open_shift |
| `Joined` | `shift`, `staff` | join_shift |
| `Tipped` | `shift`, `tipper`, `amount` | tip |
| `HoursSubmitted` | `shift`, `staff`, `minutes` | submit_hours |
| `Confirmed` | `shift`, `staff`, `confirmations: u8`, `roster: u8` | confirm |
| `Settled` | `shift`, `pool`, `by_timeout`, `triggered_by`, `shares: Vec<u64>` | settle |

Together, the events and the immutable account history give a full public audit trail of a shift: who tipped, who changed which hours, who agreed to which version, and who received what.
