# Lifecycle of a shift

## Team setup and votes

```mermaid
sequenceDiagram
  autonumber
  actor Ana
  actor Ben
  actor Kasia
  participant P as napiwek program
  Ana->>P: create_team("Bistro", window, [Ana, Ben, Kasia])
  Note over P: Team PDA = ["team", Ana]<br/>Ana gets no extra rights
  Ana->>P: propose(add, Ola)
  Note over P: votes = 0b001 → 1 of 3, pending
  Ben->>P: vote(id)
  Note over P: votes = 0b011 → 2 of 3 > half<br/>Ola added, proposal cleared
```

## A shift, start to payout

```mermaid
sequenceDiagram
  autonumber
  actor S as Staff (Ana, Ben, Kasia)
  actor G as Guest
  actor X as Anyone
  participant P as Program
  participant V as Vault
  S->>P: Ana: open_shift(480 min, [Ana, Ben])
  P->>V: create ATA(mint, Shift PDA)
  S->>P: Kasia: join_shift() · version++
  G->>P: tip(10 USDC)
  P->>V: transfer_checked guest → vault
  S->>P: Ana: end_shift() · closes_at = now
  S->>P: each: submit_hours(480 / 360 / 240) · version++
  S->>P: Ana, Ben: confirm(version)
  Note over P: 2 of 3 confirmed the current version
  X->>P: settle([Ana, Ben, Kasia token accounts])
  P->>V: PDA signs 3 × transfer_checked, then close
```

## Shift phases

The program has no explicit state enum. A shift's phase follows from the clock and its fields. The client mirrors this exact logic in `phaseOf` and `canSettle` (`app/src/solana.ts`).

```mermaid
stateDiagram-v2
  [*] --> Open: open_shift
  Open --> Confirming: closes_at reached
  Confirming --> Settled: settle, majority (pro-rata)
  Confirming --> Fallback: confirm window passed
  Fallback --> Settled: settle (equal if no majority)
  Settled --> [*]
```

| Phase | Condition | Allowed |
|---|---|---|
| **Open** | `now < closes_at` | `tip`, `join_shift`, `end_shift`, `submit_hours` |
| **Confirming** | `closes_at ≤ now < closes_at + confirm_window` | the above, plus `confirm(version)`. `settle` works only with a majority |
| **Fallback** | `now ≥ closes_at + confirm_window` | everything, and `settle` always succeeds (equal split if there is no majority) |
| **Settled** | `settled == true` | nothing. The vault is closed, so late tips fail instead of getting stuck |

::: info Why hours can still change after the shift closes
`submit_hours` is allowed until settlement so people can fix mistakes. Every change bumps `version`, which voids all earlier confirmations, so a late edit can't sneak past people who already agreed.
:::
