# Split and majority maths

Both rules are pure functions in the program, covered by unit tests and ported exactly to the client so the UI can preview payouts.

## `split(pool, weights)`

[lib.rs:374](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L374)

```rust
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
        if *w > weights[top] { top = i; }
    }
    shares[top] += dust;
    shares
}
```

**Rule.** Each share is `⌊pool · wᵢ / Σw⌋`, computed in `u128` so that `pool · w` can't overflow. The remainder (at most *n − 1* base units) goes to the **largest weight**, or the first one on a tie. Every base unit is paid, so the vault ends at exactly zero and can be closed.

**Properties**
- `Σ shares == pool`, always.
- No share is below its exact pro-rata value by more than one base unit.
- In `settle`, `total_minutes == 0` (nobody entered hours) falls back to equal weights, so the `total == 0` branch is only a guard.

### Worked example (the demo)

Pool 30 USDC = 30 000 000 base units, hours 8 h / 6 h / 4 h → weights 480 / 360 / 240, Σ = 1080.

| | Weight | Exact | Floor | + dust | Paid |
|---|---|---|---|---|---|
| Ana | 480 | 13 333 333.33 | 13 333 333 | **+1** | **13.333334** |
| Ben | 360 | 10 000 000 | 10 000 000 | | **10.000000** |
| Kasia | 240 | 6 666 666.67 | 6 666 666 | | **6.666666** |
| Sum | | | 29 999 999 | 1 | **30.000000** |

## `passes(votes, n)`

[lib.rs:395](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L395)

```rust
pub fn passes(votes: u16, n: usize) -> bool {
    let mask: u32 = (1u32 << n) - 1;
    (votes as u32 & mask).count_ones() as usize * 2 > n
}
```

A strict majority of the **current** team: 1 of 1, 2 of 2, 2 of 3, 3 of 4, 3 of 5 … 7 of 12. Bits above `n` are masked off, so stale bits can never count. `n ≤ 12` keeps the shift in `u32` safe.

The same "more than half" rule applies to shift confirmations: `confirmations() * 2 > staff.len()`, where only entries with `confirmed_version == version` count.

## Tests

[lib.rs:808](https://github.com/AyhanSh/jar-tips/blob/f36acc298f7e6e669d7ca984a7822c684bd5bc47/programs/napiwek/src/lib.rs#L808)

```rust
split(100_000_001, &[480, 360, 240]) == [44_444_446, 33_333_333, 22_222_222]  // sums to pool
split(10, &[1, 1, 1]) == [4, 3, 3]
split(0, &[5, 5])     == [0, 0]
split(7, &[0, 0])     == [0, 0]
passes(0b101, 3) && !passes(0b001, 3) && passes(0b0111, 4) && !passes(0b0011, 4)
!passes(0b1000_0001, 3)  // bits beyond the team size don't count
passes(0xFFF, 12) && !passes(0b11_1111, 12)
```

```bash
cargo test -p napiwek
# test tests::equal_split_and_zero_pool ... ok
# test tests::majority_of_the_team ... ok
# test tests::splits_pro_rata_without_losing_dust ... ok
# test result: ok. 3 passed; 0 failed
```

## Client mirror

`app/src/solana.ts` re-implements `split` with `bigint` (`previewShares`), and the "more than half" check as `hasMajority` / `needed`. The shift page shows each person's payout live, using the same rule the program will apply.
