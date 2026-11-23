/**
 * Wallet connection for the treasury app.
 *
 * Ported from the treasury console (which ported it from the open-letter
 * repo), behavior kept on purpose: everything goes through Hedera Wallet
 * Connect (HIP-820 WalletConnect v2), so the page never talks to a wallet's
 * internals and never holds a key. HashPack and Kabila are reached by the
 * extension handshake first, then the pairing deep link, then the pairing
 * dialog — the same three roads, in the same order.
 *
 * Three rules this file exists to keep:
 *
 * 1. **No key, ever.** The wallet signs and pays. The page only sees an
 *    account id, and only after the user approved the session.
 * 2. **Least privilege.** The session asks for exactly one method,
 *    `hedera_signAndExecuteTransaction`, on exactly one chain — the one the
 *    build was configured for. For an app that moves HBAR, this matters more
 *    than it did for a signature.
 * 3. **Nothing is loaded until it is needed.** The connector, the SDK and
 *    the WalletConnect client together are several hundred kilobytes; every
 *    import below is dynamic and happens on the first "Connect".
 */
import { config } from '../config'
import type { HederaNetwork } from './hedera'

/**
 * Deep imports, not the package root: the root entry also exports the
 * *wallet*-side code, which pulls `@reown/walletkit`, `@reown/appkit` and
 * `ethers` into the bundle for a dApp that uses none of them. The package
 * publishes no `exports` map, so these paths are stable for as long as the
 * version is pinned (see package.json).
 */
type ConnectorModule = typeof import('@hashgraph/hedera-wallet-connect/dist/lib/dapp/index.js')
type SharedModule = typeof import('@hashgraph/hedera-wallet-connect/dist/lib/shared/index.js')
type SdkModule = typeof import('@hiero-ledger/sdk')
type DAppConnector = import('@hashgraph/hedera-wallet-connect/dist/lib/dapp/index.js').DAppConnector

export type WalletKind = 'hashpack' | 'kabila' | 'walletconnect'

export interface WalletOption {
  kind: WalletKind
  label: string
  note: string
}

/** The three the button offers, in the order they are shown. */
export const WALLET_OPTIONS: readonly WalletOption[] = [
  { kind: 'hashpack', label: 'HashPack', note: 'Hedera wallet — app or extension' },
  { kind: 'kabila', label: 'Kabila', note: 'Hedera wallet — app or extension' },
  { kind: 'walletconnect', label: 'WalletConnect', note: 'Any other wallet, by QR code' },
]

export interface WalletSession {
  accountId: string
  network: HederaNetwork
}

export type WalletErrorCode =
  | 'not_configured'
  | 'insecure_context'
  | 'rejected'
  | 'no_account'
  | 'wrong_network'
  | 'load_failed'
  | 'unknown'

/**
 * The WalletConnect handshake generates an X25519 key pair with WebCrypto. The
 * browser only exposes `crypto.subtle` in a **secure context** — HTTPS, or
 * `localhost`/`127.0.0.1`. Served over plain HTTP from a hostname, `crypto.subtle`
 * is `undefined` and the SDK's `connect()` never settles. localhost qualifies —
 * but a check costs nothing and explains the rule.
 */
export function hasWebCrypto(): boolean {
  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle
  return typeof subtle?.generateKey === 'function'
}

export const INSECURE_CONTEXT_MESSAGE =
  'Wallets need a secure connection. This page is served over plain HTTP, where the browser disables the cryptography WalletConnect uses — open it over HTTPS, or on localhost.'

export class WalletError extends Error {
  readonly code: WalletErrorCode

  constructor(code: WalletErrorCode, message: string) {
    super(message)
    this.name = 'WalletError'
    this.code = code
  }
}

/** Shown to the user — never a stack trace, never a raw SDK message. */
export function describeWalletError(error: unknown): string {
  if (error instanceof WalletError) return error.message
  const raw = error instanceof Error ? error.message : String(error ?? '')
  if (/user rejected|user canceled|user cancelled|rejected by user|denied/i.test(raw)) {
    return 'The request was rejected in your wallet.'
  }
  if (/session (not found|does not exist)|no matching key|session topic doesn't exist/i.test(raw)) {
    return 'The wallet session expired. Please connect again.'
  }
  if (/timed out|timeout/i.test(raw)) {
    return 'The wallet did not answer in time. Please try again.'
  }
  if (/network|fetch|offline/i.test(raw)) {
    return 'Could not reach the wallet relay. Check your connection and try again.'
  }
  return 'The wallet connection failed. Please try again.'
}

/**
 * The WalletConnect explorer lists each wallet's own deep link. We do not
 * hardcode `hashpack://…` or a universal link: the registry is where a wallet
 * publishes the one it keeps working, and guessing it is how a "Connect" button
 * silently stops opening the app.
 */
const EXPLORER_URL = 'https://explorer-api.walletconnect.com/v3/wallets'

interface ExplorerListing {
  name?: string
  slug?: string
  mobile?: { native?: string; universal?: string }
}

const REGISTRY: Partial<Record<WalletKind, { search: string; slug: string; name: string }>> = {
  hashpack: { search: 'hashpack', slug: 'hashpack', name: 'hashpack' },
  kabila: { search: 'kabila', slug: 'kabila-wallet', name: 'kabila' },
}

export interface WalletLinks {
  /** The app's own scheme, e.g. `hashpack:` — opens the app itself. */
  native: string | null
  /** The https landing page — opens a website, where the app is one tap away. */
  universal: string | null
}

/** Both mobile links the registry publishes, or two nulls. */
export async function walletLinks(
  kind: WalletKind,
  projectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WalletLinks> {
  const none: WalletLinks = { native: null, universal: null }
  const entry = REGISTRY[kind]
  if (!entry || !projectId) return none
  try {
    const url = `${EXPLORER_URL}?projectId=${encodeURIComponent(projectId)}&entries=10&search=${encodeURIComponent(entry.search)}`
    const res = await fetchImpl(url, { headers: { accept: 'application/json' } })
    if (!res.ok) return none
    const body = (await res.json()) as { listings?: Record<string, ExplorerListing> }
    const listings = Object.values(body.listings ?? {})
    const match =
      listings.find((listing) => listing.slug === entry.slug) ??
      listings.find((listing) => listing.name?.toLowerCase() === entry.name)
    const clean = (value: string | undefined): string | null =>
      typeof value === 'string' && value.length > 0 ? value : null
    return {
      native: clean(match?.mobile?.native),
      universal: clean(match?.mobile?.universal),
    }
  } catch {
    return none
  }
}

/**
 * The link to open on a phone: the wallet's own scheme, because that opens the
 * app in one step. The registry's https link lands on the wallet's *website*
 * first — the user then has to find "open app" there, and stays on that site
 * afterwards. The universal link stays as the fallback for wallets that
 * publish nothing else.
 */
export async function walletLink(
  kind: WalletKind,
  projectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const links = await walletLinks(kind, projectId, fetchImpl)
  return links.native ?? links.universal
}

/**
 * `wc:<topic>@2?…` handed to a wallet. Same shape the WalletConnect clients
 * themselves build: `<universal>/wc?uri=…` for https links, and
 * `<scheme>//wc?uri=…` for native schemes (`hashpack:` → `hashpack://wc?uri=…`).
 */
export function deepLinkFor(link: string, uri: string): string {
  const encoded = encodeURIComponent(uri)
  const base = link.replace(/\/+$/, '')
  if (/^https?:/i.test(base)) return `${base}/wc?uri=${encoded}`
  // `hashpack:`, `hashpack://` and `hashpack://host` all become `hashpack://wc?uri=…`.
  return `${base}//wc?uri=${encoded}`
}

/** Whether to deep-link or to show the pairing code. */
export function isMobileWalletTarget(userAgent?: string): boolean {
  const ua = userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent)
  return /android|iphone|ipad|ipod/i.test(ua)
}

import { normalizeAccountId } from './hedera'
export { normalizeAccountId }

/**
 * The id HashPack's extension announces itself with (read from its own
 * `content_script.js`, v15.1.1, as in the sibling repos). The handshake
 * keys on the id, not the display name.
 */
export const HASHPACK_EXTENSION_ID = 'gjagmgiddbbciopjhllkdnddhcglnemk'

export function findExtension(
  instance: Pick<DAppConnector, 'extensions'>,
  kind: WalletKind,
): { id: string } | null {
  if (kind === 'walletconnect') return null
  const match = instance.extensions.find((extension) => {
    const name = extension.name ?? ''
    if (kind === 'hashpack') {
      return (
        extension.id === HASHPACK_EXTENSION_ID ||
        /hashpack/i.test(extension.id) ||
        /hashpack/i.test(name)
      )
    }
    return /kabila/i.test(extension.id) || /kabila/i.test(name)
  })
  return match ? { id: match.id } : null
}

/** Discovery is asynchronous; poll briefly before falling back to the dialog. */
async function waitForExtension(
  instance: DAppConnector,
  kind: WalletKind,
  budgetMs = 450,
): Promise<{ id: string } | null> {
  const deadline = Date.now() + budgetMs
  for (;;) {
    const found = findExtension(instance, kind)
    if (found || Date.now() >= deadline) return found
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

let pending: Promise<DAppConnector> | null = null

async function loadModules(): Promise<{
  connector: ConnectorModule
  shared: SharedModule
  sdk: SdkModule
}> {
  try {
    const [connector, shared, sdk] = await Promise.all([
      import('@hashgraph/hedera-wallet-connect/dist/lib/dapp/index.js'),
      import('@hashgraph/hedera-wallet-connect/dist/lib/shared/index.js'),
      import('@hiero-ledger/sdk'),
    ])
    return { connector, shared, sdk }
  } catch (error) {
    throw new WalletError(
      'load_failed',
      `The wallet library could not be loaded. ${describeWalletError(error)}`,
    )
  }
}

async function createConnector(): Promise<DAppConnector> {
  const projectId = config.walletConnectProjectId
  if (!projectId) {
    throw new WalletError(
      'not_configured',
      'Wallet connection is not configured for this build (VITE_WALLETCONNECT_PROJECT_ID is empty).',
    )
  }

  const [{ connector, shared, sdk }] = await Promise.all([loadModules()])

  const pageUrl =
    typeof location === 'undefined'
      ? 'http://127.0.0.1:5173/'
      : new URL(import.meta.env.BASE_URL, location.origin).toString()

  // The wallet returns the user here once the session is approved. Without
  // this the phone stays on the wallet's own page and the dApp never learns
  // the answer until it is opened by hand. The marker tells the page it was
  // reached that way, so it may wait for the session instead of assuming none.
  const returnUrl = new URL(pageUrl)
  returnUrl.searchParams.set(RETURN_PARAM, 'return')

  const metadata = {
    name: 'Open Letter Treasury',
    description:
      'Public treasury stats and signer tools. Every transaction is signed and paid by your wallet; this page holds no key.',
    url: pageUrl,
    icons: [new URL('icon-256.png', pageUrl).toString()],
    redirect: { universal: returnUrl.toString() },
  }

  const ledgerId = config.network === 'mainnet' ? sdk.LedgerId.MAINNET : sdk.LedgerId.TESTNET

  const instance = new connector.DAppConnector(
    metadata,
    ledgerId,
    projectId,
    // Least privilege: exactly the one call every action in this app needs.
    [shared.HederaJsonRpcMethod.SignAndExecuteTransaction],
    [shared.HederaSessionEvent.AccountsChanged, shared.HederaSessionEvent.ChainChanged],
    // One chain only — the one this build is switched to.
    [config.profile.chainId],
  )

  await instance.init({ logger: 'error' })
  return instance
}

function connector(): Promise<DAppConnector> {
  pending ??= createConnector().catch((error: unknown) => {
    // A failed load must not be cached as a broken promise.
    pending = null
    throw error
  })
  return pending
}

/** The cached connector for `lib/create.ts` and `lib/transfer.ts` — the one door to the session. */
export function getConnector(): Promise<DAppConnector> {
  return connector()
}

/** The SDK + shared modules, loaded once, for the signing paths. */
export async function getSdkAndShared(): Promise<{ shared: SharedModule; sdk: SdkModule }> {
  const { shared, sdk } = await loadModules()
  return { shared, sdk }
}

/**
 * Warm the wallet chunks while the pointer is on the button. It only fetches
 * code — no connector, no relay connection, nothing sent anywhere.
 */
export function prefetchWallet(): void {
  if (!config.walletConnectProjectId || !hasWebCrypto()) return
  void loadModules().catch(() => {
    // A failed prefetch costs nothing; the click will report it.
  })
}

/** The signer for this network, if a session is already open. */
export function sessionOf(instance: DAppConnector): WalletSession | null {
  const signer = instance.signers.find((candidate) => {
    const ledger = candidate.getLedgerId().toString()
    return ledger === config.network
  })
  if (!signer) return null
  const accountId = normalizeAccountId(signer.getAccountId().toString())
  return accountId ? { accountId, network: config.network } : null
}

/**
 * Whether a stored session exists, without starting the connector.
 *
 * The WalletConnect client keeps its own session records in localStorage under
 * `wc@2:client:` — that is the protocol's, not this page's: the app itself
 * stores nothing (README → "Nothing is stored"). Its presence means this
 * browser has connected before, and lets the session be picked up quietly.
 */
export function hasStoredSession(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    // Any WalletConnect record counts — the client's storage layout has moved
    // between versions, and a narrower prefix once missed a session that was
    // there all along.
    return Object.keys(localStorage).some((key) => key.startsWith('wc@2:'))
  } catch {
    return false
  }
}

/** How long a pairing may stay unanswered before the UI lets go. */
export const CONNECT_TIMEOUT_MS = 120_000

/** A silent restore gives up quickly — nobody asked for it. */
export const RESTORE_TIMEOUT_MS = 10_000

/** How long the page waits for a wallet app to take over before offering the code. */
export const APP_OPEN_GRACE_MS = 2_500

/** The query parameter a wallet app is told to come back with. */
export const RETURN_PARAM = 'wallet'

/** Whether this page load is a wallet app sending the user back. */
export function isWalletReturn(search?: string): boolean {
  const query = search ?? (typeof location === 'undefined' ? '' : location.search)
  return new URLSearchParams(query).get(RETURN_PARAM) === 'return'
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WalletError('unknown', message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  }) as Promise<T>
}

export interface ConnectOptions {
  userAgent?: string
  fetchImpl?: typeof fetch
  /** Called with the `wc:` pairing string when a wallet is deep-linked. */
  onPairing?: (uri: string) => void
  /** Which road the pairing took — see ConnectDialog for what each implies. */
  onRoute?: (route: ConnectRoute) => void
}

export type ConnectRoute = 'extension' | 'deep-link' | 'dialog'

/**
 * Open a session. Returns the account the wallet approved, or throws a
 * `WalletError` with a sentence that can be shown to the user.
 */
export async function connect(kind: WalletKind, options: ConnectOptions = {}): Promise<WalletSession> {
  if (!hasWebCrypto()) {
    throw new WalletError('insecure_context', INSECURE_CONTEXT_MESSAGE)
  }

  const instance = await connector()

  const existing = sessionOf(instance)
  if (existing) return existing

  // Which road this attempt took, so the marker records how to restore it.
  let route: ConnectRoute = 'dialog'
  const note = (taken: ConnectRoute): void => {
    route = taken
    options.onRoute?.(taken)
  }

  try {
    // 1. An extension that answers the Hedera handshake connects directly.
    const extension = kind === 'walletconnect' ? null : await waitForExtension(instance, kind)
    if (extension) {
      note('extension')
      await withTimeout(
        instance.connectExtension(extension.id),
        CONNECT_TIMEOUT_MS,
        'The wallet did not answer in time. Please try again.',
      )
    } else if (kind === 'walletconnect') {
      note('dialog')
      await withTimeout(
        // `true` = reject when the pairing dialog is closed, so closing it is an
        // answer ("rejected") instead of a wait that only the timeout ends.
        instance.openModal(undefined, true),
        CONNECT_TIMEOUT_MS,
        'The wallet did not answer in time. Please try again.',
      )
    } else {
      // 2. No extension: hand the pairing to the wallet's own app on a phone…
      const link = await walletLink(kind, config.walletConnectProjectId, options.fetchImpl ?? fetch)
      const target = isMobileWalletTarget(options.userAgent)
      if (link && target) {
        note('deep-link')
        await withTimeout(
          instance.connect((uri) => {
            options.onPairing?.(uri)
            // Whether the app actually took over is the only question the
            // fallback may ask. A page that was hidden and came back has
            // already been answered by the app — opening the pairing code then
            // covers the page the user just returned to, which is exactly what
            // it must not do.
            let appTookOver = false
            const watchForApp = (): void => {
              if (typeof document === 'undefined') return
              if (document.visibilityState === 'hidden') appTookOver = true
            }
            if (typeof document !== 'undefined') {
              document.addEventListener('visibilitychange', watchForApp)
            }
            // Only a page restored from the back-forward cache is a return from
            // the app. A plain `pageshow` also fires when a scheme navigation
            // fails, and treating that as "the app opened" would suppress the
            // pairing code exactly when it is needed.
            const onBack = (event: PageTransitionEvent): void => {
              if (event.persisted) appTookOver = true
            }
            if (typeof window !== 'undefined') {
              window.addEventListener('pageshow', onBack)
            }

            window.location.href = deepLinkFor(link, uri)

            // A scheme that opens nothing leaves the user staring at the same
            // page. If this one is still in front after a moment, offer the
            // pairing code for the same URI instead of a dead end.
            setTimeout(() => {
              if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', watchForApp)
              }
              if (typeof window !== 'undefined') window.removeEventListener('pageshow', onBack)
              if (appTookOver) return
              if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
              note('dialog')
              instance.walletConnectModal.openModal({ uri })
            }, APP_OPEN_GRACE_MS)
          }),
          CONNECT_TIMEOUT_MS,
          'The wallet did not answer in time. Please try again.',
        )
      } else {
        // 3. …and on a desktop without the extension, the pairing dialog is the
        // only path left: it shows the code the wallet pastes or scans.
        note('dialog')
        await withTimeout(
          instance.openModal(undefined, true),
          CONNECT_TIMEOUT_MS,
          'The wallet did not answer in time. Please try again.',
        )
      }
    }
  } catch (error) {
    // A pairing that timed out leaves the WalletConnect dialog open; close it.
    instance.walletConnectModal.closeModal()
    if (error instanceof WalletError) throw error
    throw new WalletError('rejected', describeWalletError(error))
  }

  const session = sessionOf(instance)
  if (!session) {
    throw new WalletError(
      'no_account',
      `The wallet connected without a Hedera account on ${config.network}.`,
    )
  }
  // Any road counts: a phone has no extension, and its reload still has to know
  // that this browser may read a session back.
  rememberWallet(kind, route)
  return session
}

/** Close every session and pairing this page opened. */
export async function disconnect(): Promise<void> {
  forgetExtension()
  if (!pending) return
  const instance = await pending
  await instance.disconnectAll()
}


/**
 * The one thing this page keeps in the browser: which wallet kind this
 * browser last connected with, and by which road (`hashpack:deep-link`). It is
 * not a session and not a key — it only tells a reload that this browser has
 * connected before, so it may quietly read the session back instead of asking
 * anyone. Older values are a bare kind, which meant an extension.
 */
const EXTENSION_MARKER_KEY = 'treasury.wallet.extension'

function readMarker(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(EXTENSION_MARKER_KEY)
  } catch {
    return null
  }
}

/** The extension that connected, if that is how this browser last did it. */
export function rememberedExtension(): WalletKind | null {
  const value = readMarker()
  if (!value) return null
  const [kind, road = 'extension'] = value.split(':')
  if (road !== 'extension') return null
  return kind === 'hashpack' || kind === 'kabila' ? kind : null
}

function rememberWallet(kind: WalletKind, route: ConnectRoute): void {
  try {
    localStorage.setItem(EXTENSION_MARKER_KEY, `${kind}:${route}`)
  } catch {
    // Private mode or a full quota: the reload simply will not restore.
  }
}

function forgetExtension(): void {
  try {
    localStorage.removeItem(EXTENSION_MARKER_KEY)
  } catch {
    // Nothing to do — the marker is a convenience, not state.
  }
}

/** Whether this browser has connected before, by any road. */
export function hasConnectedBefore(): boolean {
  return readMarker() !== null
}

/**
 * Pick up a session this browser already holds — WalletConnect's own storage
 * is read, nothing is negotiated. A restore must never open a wallet prompt:
 * `connector()` initialises the client, `init` rebuilds the signers from the
 * stored session, and `sessionOf` answers from that. When nothing is stored,
 * this answers null and the page stays disconnected.
 */
export async function restore(options: { waitMs?: number } = {}): Promise<WalletSession | null> {
  if (!hasStoredSession() && !hasConnectedBefore() && !options.waitMs) return null
  try {
    const instance = await connector()
    const found = sessionOf(instance)
    if (found || !options.waitMs) return found
    // Coming back from a wallet app: the approval may still be on its way, so
    // wait for the session instead of answering "not connected" too early.
    const deadline = Date.now() + options.waitMs
    for (;;) {
      if (Date.now() >= deadline) return null
      await new Promise((resolve) => setTimeout(resolve, 300))
      const session = sessionOf(instance)
      if (session) return session
    }
  } catch {
    return null
  }
}

/**
 * Watch for a session that shows up *after* the page is already up.
 *
 * On a phone the wallet's approval often reaches the relay after the page has
 * loaded — the client reconnects, the settle arrives, and the signer exists a
 * second or two later. A page that checked once would sit on "Connect" while
 * the session was already there, which is why a click used to make it appear
 * instantly. This keeps looking, and stops at the first session.
 */
export function pollForSession(
  read: () => WalletSession | null,
  onSession: (session: WalletSession) => void,
  options: { budgetMs?: number; intervalMs?: number } = {},
): () => void {
  const budgetMs = options.budgetMs ?? 60_000
  const intervalMs = options.intervalMs ?? 1_000
  const started = Date.now()
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const tick = (): void => {
    if (stopped) return
    const session = read()
    if (session) {
      stopped = true
      onSession(session)
      return
    }
    if (Date.now() - started >= budgetMs) return
    timer = setTimeout(tick, intervalMs)
  }

  timer = setTimeout(tick, intervalMs)
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}

/**
 * The same watch, over the real connector — plus an immediate look whenever the
 * page comes back into view, which is exactly the moment a phone returns from
 * the wallet app. Waiting for the next tick there is a second of nothing.
 */
export function watchSession(
  onSession: (session: WalletSession) => void,
  options: { budgetMs?: number; intervalMs?: number } = {},
): () => void {
  let instance: DAppConnector | null = null
  let priming = false
  let delivered = false

  const read = (): WalletSession | null => {
    if (!instance && !priming) {
      priming = true
      void connector()
        .then((created) => {
          instance = created
        })
        .catch(() => {
          // A connector that will not start simply means no session yet.
        })
    }
    return instance ? sessionOf(instance) : null
  }

  const deliver = (session: WalletSession): void => {
    if (delivered) return
    delivered = true
    onSession(session)
  }

  const stopPolling = pollForSession(read, deliver, { intervalMs: 750, ...options })

  const onVisible = (): void => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
    const session = read()
    if (session) deliver(session)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible)
  }

  return () => {
    stopPolling()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }
}

/** Test seam: drop the cached connector between cases. */
export function resetConnectorForTests(): void {
  pending = null
}

/** Same voice as describeWalletError, for the submit call specifically. */
export function describeSubmitError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  if (/user rejected|user canceled|user cancelled|rejected by user|denied/i.test(raw)) {
    return 'The request was rejected in your wallet.'
  }
  if (/session (not found|does not exist)|no matching key|session topic doesn't exist/i.test(raw)) {
    return 'The wallet session expired. Please connect again.'
  }
  if (/timed out|timeout/i.test(raw)) {
    return 'The wallet did not answer in time. Please try again.'
  }
  return 'The transaction could not be submitted. Please try again.'
}
