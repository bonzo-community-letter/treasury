# Open Letter Treasury

The treasury page for the Bonzo community letter: **https://bonzo-community-letter.com/treasury/**.
One static page, three layers deep — public stats for everyone, a wallet
connection that resolves your role from the chain, and the two actions a role
unlocks: creating a threshold treasury account, and moving HBAR out of one.

The page never sees a private key. Every transaction is signed inside the
connected wallet (HashPack extension or WalletConnect, HIP-820); this page only
builds the transaction bytes, asks the wallet to sign and execute them, and
reads the result back from the public mirror node.

## The three layers

1. **Public stats — no wallet, no permission.** Balance in HBAR and USD (the
   USD figure is CoinGecko's, labeled with the time it was fetched, cached 60
   s), the last fifteen transactions of the treasury with the counterparty on
   each one derived from the mirror's `transfers` list, and the pending
   scheduled transfers with signatures collected versus the threshold and an
   expiry countdown. Twenty-second poll, manual refresh, and no re-read of
   anything that did not change — the mirror is not ours to hammer.
2. **Connect and role.** `admin` if the connected account id equals the
   configured admin account; `signer` if the connected account's own on-chain
   key (read from the mirror) is one of the treasury account's key-list keys —
   or if the session is the treasury itself; `visitor` otherwise, plainly
   told this wallet holds no key here. The role badge is cosmetic. The chain
   enforces everything: only the admin's key can pay for a CryptoCreate, and
   only signatures from the treasury key list count.
3. **Actions.** Admin: create a treasury (m-of-n threshold account, always a
   threshold key even at 1-of-N, your wallet pays). Admin or signer: transfer
   — a plain `CryptoTransfer` when the treasury's threshold is 1 (your wallet
   pays the fee and its key satisfies the 1-of-N), or a `ScheduleCreate`
   wrapping the transfer when the threshold is m > 1. The other signers
   connect, see the pending schedule, press "Sign this schedule"
   (`ScheduleSignTransaction`); the network executes the moment the threshold
   is met, or lets it expire. Functionally the LimeChain hedera-multisig
   pattern, with status always read from the mirror, never assumed.

The scheduled transfer deliberately carries **no transaction id**: the network
assigns one at execution and the inner fee payer defaults to the schedule's
creator — which is what keeps the ScheduleCreate signable by one wallet.

## Configuration

Copy `.env.example` to `.env.local` (gitignored) and fill in:

```
VITE_HEDERA_NETWORK=mainnet          # mainnet | testnet (a typo throws at load)
VITE_ADMIN_ACCOUNT=0.0.10964527      # the only account allowed to create treasuries
VITE_TREASURY_ACCOUNTS=              # optional comma list; discovery fills the gap
VITE_WALLETCONNECT_PROJECT_ID=       # WalletConnect Cloud project id
```

Defaults in code: mainnet, admin `0.0.10964527`, treasury list empty.
`VITE_WALLETCONNECT_PROJECT_ID` is not a secret (it ships in the bundle) but
belongs in `.env.local` locally and in **repository variables** for CI — never
in the repo. Never put a private key or any Hedera account secret in any of
these files.

**Treasury discovery.** When `VITE_TREASURY_ACCOUNTS` is empty the page lists
what the admin account has created (its `CRYPTOCREATEACCOUNT` rows, `entity_id`
per row) and unions that with the configured list. `?account=0.0.x` in the URL
overrides everything and previews any account — that is how the app can be
exercised before a treasury exists in config.

## What the mirror can and cannot tell you

Verified live against `mainnet-public.mirrornode.hedera.com` while building
this:

- `/accounts/{id}` returns complex keys as `_type: "ProtobufEncoded"` — the
  app decodes `proto.Key` into `{ threshold, keys[] }` (fixture: account
  `0.0.10964694`, a 2-of-3 ECDSA threshold; its bytes are baked into the
  tests).
- `/transactions?account.id=` has no `transactiontype` filter — the app
  filters by `name` client-side.
- `/schedules?account.id=` matches the schedule **creator only**. Payer-only
  and accounts mentioned inside the scheduled body return empty. So the
  pending list searches the treasury's creators it knows (configured treasuries
  + admin + connected wallet) and then keeps only schedules whose decoded body
  debits the treasury. The panel says which creators were searched.
- A schedule row has no recipient or amount fields — those live in
  `transaction_body` (base64 `proto.SchedulableTransactionBody`), which the
  app decodes.
- `signatures[].public_key_prefix` is base64 of the signer's **full raw
  public key** (33 bytes ECDSA, 32 ED25519) despite the name. Per-signer
  checkmarks compare `base64(rawKey)` against it; the collected count is
  `signatures.length`.
- Deleted (cancelled) schedules still appear in listings, and `deleted` is not
  a queryable filter — the app labels them "Cancelled".

## Start

```
npm ci
npm run dev            # http://127.0.0.1:5173 (loopback only, on purpose)
```

Quality gates: `npm test`, `npm run typecheck`, `npm run build`.

`.env.local` additionally needs `VITE_WALLETCONNECT_PROJECT_ID` before any
wallet connect will work; without it every read-only layer still runs.

## Testnet rehearsal

Everything below touches a real chain; keep `VITE_HEDERA_NETWORK=testnet` plus
a testnet `VITE_ADMIN_ACCOUNT` you control.

1. Open `?account=0.0.<something>` to see the stats layer against any testnet
   account, no permissions needed.
2. Connect the admin wallet (HashPack extension on testnet, or WalletConnect
   with a testnet session). The badge must read `admin`.
3. Create a treasury with 2–3 public keys at threshold 2. The wallet signs one
   `AccountCreateTransaction`; the receipt page shows the new account id and
   the `VITE_TREASURY_ACCOUNTS=…` line to pin next deploy.
4. Fund the new treasury from the admin wallet (a plain transfer into it).
5. Start a transfer out of it: the form shows the scheduled path; the app
   creates the schedule, and it appears under Pending with 1 of 2.
6. Connect a second signer's wallet (the key must be one of the treasury's
   keys — the preflight says so if it is not), press "Sign this schedule".
   The mirror read-back should flip to Executed with the executed
   transaction linked.
7. Re-do it with expiry 30 minutes and nobody signing, to see the expired
   state rendered honestly.

What this rehearsal cannot replace: every signing flow above is untested
against a live wallet until someone actually clicks through it — the page
builds and the mirror reads are tested, but a wallet's approval dialog is a
human step. The unit tests cover plan building, protobuf decoding (both
curves, both directions), mirror parsing with mocked fetch, role resolution,
schedule status mapping and money formatting — 101 tests, no network.

## Deployment

`.github/workflows/pages.yml` builds on push to `main` (npm ci, tests,
typecheck, build) and deploys `dist/` to GitHub Pages. The site lands under
`/treasury/` of the user-site custom domain `bonzo-community-letter.com`; the
build keeps the relative asset base (`base: './'`, `VITE_BASE=/` available for
a root-served deploy).

Before the first deploy, set the repository **variables** the build job reads:
`VITE_WALLETCONNECT_PROJECT_ID` (required for the wallet layers), and
`VITE_HEDERA_NETWORK`, `VITE_ADMIN_ACCOUNT`, `VITE_TREASURY_ACCOUNTS` (all
optional — the code defaults above apply). Without the project id the page
deploys as read-only stats and says so quietly at the bottom.

## Security model

- Static site, no backend, no analytics, no persistence of anything secret.
  Reads: the two mirror nodes and CoinGecko. Writes: only what a connected
  wallet signs.
- CSP in the built meta tag allows exactly: `'self'` scripts/styles, the two
  mirror bases, CoinGecko, the WalletConnect relay (both official domains, wss
  and https), the WalletConnect explorer API, HashPack's site for the deep
  link, and `frame-src` for the WalletConnect verify iframe. Dev mode widens
  only for HMR (websocket + inline preamble).
- The wallet session asks for exactly one method
  (`hedera_signAndExecuteTransaction`) on exactly one CAIP-2 chain; there is
  no runtime network toggle — the network is a build-time decision.
- Money math is BigInt and decimal strings end to end; a float never touches
  a balance. The USD rate is pinned to micro-USD per HBAR before multiplying.
- UI gating is presentation. Authorization is the chain's: signature
  thresholds and fee-payer keys, not a badge.

One known cosmetic: the `long` library (SDK dependency) probes for WebAssembly
at startup; the CSP blocks that probe (`wasm-eval` violation logged, `long`
falls back to JS). Function and security are unaffected.

## Files

```
index.html                    CSP meta (filled by the build), title, favicon
public/icon-256.png           favicon (from open-letter)
vite.config.ts                CSP plugin (dev/build), loopback-only server, relative base
.github/workflows/pages.yml   build + deploy to GitHub Pages
src/main.tsx                  buffer polyfill (guarded), React bootstrap
src/styles.css                design tokens 1:1 from open-letter
src/App.tsx                   the three layers, treasury selector, discovery
src/config.ts                 network switch (throws on typo), admin, treasury list, ?account=
src/components/               BalanceCard, TransactionsPanel, SchedulesPanel,
                              CreateTreasuryPanel, TransferPanel, ConnectDialog, ui
src/hooks/                    useWallet (HIP-820 session), useTreasurySnapshot (20 s
                              poll), useAccountKey, useUsdPrice (60 s cache)
src/lib/wallet.ts             HashPack extension handshake, WalletConnect fallback
src/lib/create.ts             AccountCreate + threshold KeyList, receipt read
src/lib/transfer.ts           direct transfer, ScheduleCreate, ScheduleSign
src/lib/mirror.ts             account/transactions/schedules reads, receipt polling
src/lib/accountKey.ts         proto.Key decoding (threshold/keyList/single)
src/lib/schedule.ts           transaction_body decoding, signature matching, status
src/lib/treasury.ts           plan builders + validation (pure)
src/lib/keys.ts               signer-key parsing, both curves (pure)
src/lib/{hedera,bytes,time,txSummary,roles,price}.ts
src/lib/*.test.ts             101 tests, mocked fetch, live mainnet fixtures baked in
```
