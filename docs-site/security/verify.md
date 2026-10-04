# Verify it yourself

You don't have to trust this documentation. Each claim below can be checked in a few minutes.

## 1. The program cannot be changed

Open the program on [Solana Explorer](https://explorer.solana.com/address/HrFcxm1y86UTdeJB7r8khiXfSKXSvf77p7S29MPj2ZSD?cluster=devnet). It shows *Upgradeable: No*: the upgrade authority was removed, so the program is final.

From a terminal:

```bash
solana program show HrFcxm1y86UTdeJB7r8khiXfSKXSvf77p7S29MPj2ZSD -u devnet
# Authority: none
```

Or with plain JSON-RPC, without installing anything:

```bash
curl -s https://api.devnet.solana.com -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"getAccountInfo",
  "params":["Dtpy6eF8Zy2eN4WymDwf9KGDp3dMhYkBKqp7JEbeWMVz",
            {"encoding":"jsonParsed","dataSlice":{"offset":0,"length":0}}]}' \
  | grep -o '"authority":[^,]*'
# "authority":null
```

(`Dtpy6e…WMVz` is the program's ProgramData account, which holds the bytecode and the upgrade authority.)

## 2. Run the unit tests

```bash
git clone https://github.com/AyhanSh/jar-tips && cd jar-tips
cargo test -p napiwek
# test result: ok. 3 passed; 0 failed
```

## 3. Replay the end-to-end script

`app/scripts/e2e-devnet.ts` plays every role with fresh keypairs against the deployed program, funded from your `~/.config/solana/id.json`:

```bash
cd app && npm install
npx tsx scripts/e2e-devnet.ts            # majority path, pro-rata payout
npx tsx scripts/e2e-devnet.ts --timeout  # nobody confirms, equal split after 60 s
```

What it does:

1. Ana starts a team with Ben and Kasia.
2. Ana proposes adding Ola (1 of 3). ✗ An outsider tries to vote. Ben approves (2 of 3), and Ola is added.
3. Kasia proposes removing Ola (2 of 4). Ben approves (3 of 4), and Ola is removed.
4. ✗ An outsider tries to open a shift. ✗ Ben tries to list an outsider. Ben opens a shift for Ana and himself.
5. Kasia joins it herself. A guest tips twice.
6. ✗ The outsider tries to withdraw from the vault, ✗ join the shift, ✗ redirect a share, ✗ enter hours.
7. Ana ends the shift. Hours are 8 h / 6 h / 4 h. Ana and Ben confirm (2 of 3).
8. **A stranger** with no relation to the team calls `settle`, and the balances print.

Every ✗ must print `REJECTED`. Every step prints its Explorer link.

No devnet SOL? Run it against a local validator that clones the test mint:

```bash
solana-test-validator --reset --url devnet \
  --clone CuVBzJkeKCsLgCctJjSkQzy5TXyG7QZwhXMFYEVPCaSn \
  --bpf-program HrFcxm1y86UTdeJB7r8khiXfSKXSvf77p7S29MPj2ZSD target/deploy/napiwek.so
solana airdrop 10 -u localhost
cd app && RPC_URL=http://127.0.0.1:8899 npx tsx scripts/e2e-devnet.ts
```

## 4. Check transaction sizes

```bash
cd app && npx tsx scripts/check-tx-size.mts
```

```
limit 1232 bytes
create_team, 12 members: 970
open_shift, 12 staff: 828
settle, 12 staff: 707
4 account-creates (one chunk): 558
OLD open_shift + 12 creates: 1716
```

The last line shows why the app no longer creates staff token accounts inside `open_shift`: with a full roster, that transaction would not fit.

## 5. Watch the attacks fail in the app

In [the live app](https://jar-tips.vercel.app), open any shift → **Try to cheat**. Each attempt produces a failed devnet transaction. Its Explorer page shows the program logs ending in `owner does not match`, `WrongPayoutAccount` or `NotMember`.

## 6. Rebuild the program

```bash
anchor build        # Rust 1.89, Agave 3.x, Anchor CLI 1.x
```

`anchor build` regenerates `target/idl/napiwek.json`, which the client copies into `app/src/idl/`. Diff it against the committed IDL to confirm the client speaks to this program's interface.
