# Open Letter Treasury — Key setup

A small website that walks two people, each on their own, through a key ceremony for
the recovery treasury: it generates a fresh ED25519 key locally in the browser from a
new 24-word phrase (BIP-39) and hands over three values at the end — the phrase, the
private key, the public key.

Design and stack mirror the open-letter site: the same colour tokens, the same fonts,
the same stack of paper as the page form.

## What the tool does — and what it does not

**It generates keys. It creates no account.** Opening the account (a regular Hedera
account with a key threshold of 1 of 2, two people, one key each) is a separate step,
carried out by the coordinator with the public keys (`302a…`).

Six steps:

1. **Preparation** — what happens, a role name for the file name.
2. **Generate** — one click, one key; it lives only in React state.
3. **Save the phrase** — 24 numbered words, two columns of twelve; the page continues
   only after the "stored safely" checkbox.
4. **Spot check** — five random positions of the phrase must be typed out (case and
   surrounding blanks ignored). After a wrong answer: the wrong positions are shown and
   "Show the phrase again" is offered; the next quiz asks different positions. After
   three failed attempts the page clearly recommends starting over with a fresh key
   ("Start over" discards the old state).
5. **Save the keys** — once more everything on one screen: the 24 words, the private
   key (`302e…`), the public key (`302a…`), the derivation path. A copy and a download
   button per block (`bonzo-key-<role>.txt` with all three values and the path). Three
   checkboxes to tick, then "Done".
6. **Done** — "What now?": public key → coordinator; private key → HashPack later
   ("I already have a wallet" → import the private key → treasury account ID);
   phrase → backup.

## Keys and derivation

Generation exclusively via `@hiero-ledger/sdk` (declared `^2.79.0` as in open-letter,
pinned to 2.91.0 in the lockfile — the anchor vectors behave identically on both
versions): `Mnemonic.generate()` (a fresh 24-word phrase; the type declarations name
it `generate()`, at runtime it is `generate24()`) and
`mnemonic.toStandardEd25519PrivateKey()`. That is exactly HashPack's derivation:
SLIP-0010 over the BIP-39 seed at `m/44'/3030'/0'/0'`, account index 0, so in full
`m/44'/3030'/0'/0'/0'`.

What is shown and exported are the DER hex strings HashPack asks for on import:
private `privateKey.toStringDer()` (`302e…`), public `publicKey.toStringDer()`
(`302a…`).

`src/lib/keys.test.ts` pins two vector anchors (BIP-39 phrases for all-zero and
all-ones entropy). Their expected values were derived twice over before being
committed: with the SDK and with an independent implementation (PBKDF2-HMAC-SHA512 +
SLIP-0010 via `node:crypto`). If these tests go red, the derivation no longer matches
HashPack — stop the ceremony, find the cause.

## Start

```
npm ci
npm run dev            # http://127.0.0.1:5173
```

Static delivery, the way it can later sit on a USB stick:

```
npm run build && npm run preview   # http://127.0.0.1:4173
```

Quality gates: `npm test`, `npm run typecheck`.

## Hosting

The build uses a relative asset base (`base: './'` in `vite.config.ts`), so `dist/`
works served from any path — a subfolder, a stick, or `https://<owner>.github.io/<repo>/`
alike. `.github/workflows/pages.yml` builds and deploys to GitHub Pages on every push
to `main` (and on manual dispatch): npm CI, tests, typecheck, build, then
upload-pages-artifact + deploy-pages.

## Security model

- **100 % client-side.** No request at runtime: no CDN references, no webfonts, no
  analytics, no service worker. The built HTML links only its own files; the fonts are
  system faces (the same stack as open-letter), the favicon lives in `public/`.
- **CSP via meta tag:** in the build `default-src 'none'; script-src 'self';
  style-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri
  'none'; form-action 'none'`. Under `vite dev` a plugin in `vite.config.ts` widens
  the policy minimally for the HMR websocket and the inline preamble — dev mode only;
  the built HTML carries the strict form.
- **No persistence.** No localStorage, no indexedDB, no URL parameters, no cookies
  with secret material. The key state lives only in React state: close the page = it
  is gone.
- **No `console.log` of secrets**, no secrets in error messages.
- **The clipboard is a compromise:** copying is offered; the intro page says why
  transcribing by hand is the better choice on foreign machines.
- **Notice banner on every screen:** "This page sends nothing — but the machine you
  are viewing it on must be clean." A clean machine is an assumption, not a property
  of this page.

One known, harmless detail: the `long` library (a transitive dependency of the SDK)
probes at startup with a mini-wasm check whether WebAssembly is available. The strict
CSP blocks that probe — two logged `wasm-eval` violations from script-src appear in
the browser console, and `long` silently falls back to JS arithmetic. Function and
security are unaffected; to keep the console clean, add `'wasm-unsafe-eval'` to
`script-src` — for a test this app does not need.

## Limits set deliberately

The tool creates no account, sends nothing, checks no account ID, signs nothing.
Anyone generating a private key here should run the ceremony on a machine they
control — the page can know nothing about that and enforce nothing.

## Files

```
index.html                 CSP meta, title, self-hosted favicon
public/icon-256.png        favicon (taken from open-letter)
vite.config.ts             stack as open-letter; CSP plugin (dev/build), relative base
.github/workflows/pages.yml  build + deploy to GitHub Pages
src/main.tsx               buffer polyfill (guarded), React bootstrap
src/styles.css             design tokens 1:1 from open-letter
src/App.tsx                the ceremony's state machine (six steps)
src/components/            step components, sheet, word grid, progress
src/lib/keys.ts            key generation via the SDK
src/lib/quiz.ts            spot-check logic (pure, tested)
src/lib/secretFile.ts      text file bonzo-key-<role>.txt (pure, tested)
src/lib/*.test.ts          HashPack anchor vectors, quiz, file name/text
```
