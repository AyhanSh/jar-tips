# Run and deploy

## Prerequisites

- Node 20+ for the app, scripts and these docs.
- A devnet wallet with about 0.2 SOL, for the end-to-end script.
- To build or deploy the program: Rust 1.89, Agave 3.x, Anchor CLI 1.x.

## Web app

```bash
cd app
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:5174
```

| Variable | Default | Purpose |
|---|---|---|
| `VITE_RPC_URL` | `clusterApiUrl("devnet")` | A private devnet RPC avoids public rate limits |
| `VITE_PUBLIC_URL` | current origin | Where QR codes point. Set it to the deployed URL when presenting from localhost, so a phone opens the public app |

## Scripts

```bash
cd app
npx tsx scripts/e2e-devnet.ts             # full flow + attacks, majority path
npx tsx scripts/e2e-devnet.ts --timeout   # equal-split fallback
npx tsx scripts/fund.ts <wallet…>         # devnet SOL + test USDC for any wallets
npx tsx scripts/check-tx-size.mts         # offline: 12-person transactions vs. 1232 bytes
```

## Program

```bash
anchor build
cargo test -p napiwek
solana program deploy target/deploy/napiwek.so \
  --program-id target/deploy/napiwek-keypair.json -u devnet
cp target/idl/napiwek.json target/types/napiwek.ts app/src/idl/
```

The deployed program is final, so a new deploy would need a new program ID.

## These docs

The documentation is built with [VitePress](https://vitepress.dev) (MIT), with diagrams from [Mermaid](https://mermaid.js.org) (MIT) through `vitepress-plugin-mermaid`.

```bash
cd docs-site
npm install
npm run dev      # http://localhost:5173/docs/
npm run build    # → docs-site/.vitepress/dist
```

## Hosting

The app and the docs deploy together on Vercel from the repository root (`vercel.json`). The build compiles the app into `app/dist`, then builds the docs into `app/dist/docs`, so the docs are served at **[jar-tips.vercel.app/docs](https://jar-tips.vercel.app/docs/)**. The app uses hash routing (`#/shift/…`), so the two never clash.

To host the docs on their own (for example on GitHub Pages at the root), build with `DOCS_BASE=/ npm run build`.

## Repository map

```
programs/napiwek/src/lib.rs   the whole program: instructions, accounts, split(), votes, errors
app/src/solana.ts             PDAs, instruction builders, status + split preview, activity feed
app/src/actors.tsx            who signs: browser wallet + demo keypairs, send/confirm with retries
app/src/data.ts               polling hooks for the team, shifts and the vault balance
app/src/App.tsx               app shell: rail, top bar, signer switcher, transactions, toasts
app/src/pages/                Overview, Team, ShiftView, TipPage
app/src/Tour.tsx              guided spotlight tour on sample data
app/scripts/                  e2e-devnet.ts, fund.ts, check-tx-size.mts
docs-site/                    this documentation (VitePress)
```
