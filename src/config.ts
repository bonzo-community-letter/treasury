import { HASHSCAN_BASE, MIRROR_BASE, normalizeAccountId, type HederaNetwork } from './lib/hedera'

/**
 * The whole build is switched by four public values. Ported from the treasury
 * console (network, WalletConnect id) and extended with the two this app
 * adds: the admin account — the only payer allowed to create treasuries —
 * and an optional authoritative treasury list.
 *
 * Set them in `.env.local` (see `.env.example`); the Pages build reads them
 * from repository variables (see the workflow). There is deliberately no
 * runtime network toggle: a treasury must never end up on a network nobody
 * decided on.
 */
export const DEFAULT_NETWORK: HederaNetwork = 'mainnet'

/** The configured admin: the only account layer 3a lets create treasuries. */
export const DEFAULT_ADMIN_ACCOUNT = '0.0.10964435'

const read = (key: string): string => {
  const value = import.meta.env[key]
  return typeof value === 'string' ? value.trim() : ''
}

const requested = read('VITE_HEDERA_NETWORK').toLowerCase()

/**
 * A typo must not fall back silently — that is how a treasury ends up on the
 * wrong network. It fails loudly, at load, in dev and in the build.
 */
if (requested !== '' && requested !== 'mainnet' && requested !== 'testnet') {
  throw new Error(`VITE_HEDERA_NETWORK must be "mainnet" or "testnet", got "${requested}"`)
}

export const network: HederaNetwork = requested === '' ? DEFAULT_NETWORK : (requested as HederaNetwork)

export interface NetworkProfile {
  id: HederaNetwork
  /** CAIP-2 chain id the wallet session is opened for (HIP-820). */
  chainId: `hedera:${HederaNetwork}`
  /** Public mirror node REST base — reading anything needs no key. */
  mirrorBase: string
  /** Block explorer base for the account, schedule and transaction links. */
  hashscanBase: string
}

export const NETWORKS: Record<HederaNetwork, NetworkProfile> = {
  testnet: {
    id: 'testnet',
    chainId: 'hedera:testnet',
    mirrorBase: MIRROR_BASE.testnet,
    hashscanBase: HASHSCAN_BASE.testnet,
  },
  mainnet: {
    id: 'mainnet',
    chainId: 'hedera:mainnet',
    mirrorBase: MIRROR_BASE.mainnet,
    hashscanBase: HASHSCAN_BASE.mainnet,
  },
}

export const profile = NETWORKS[network]

const adminRaw = read('VITE_ADMIN_ACCOUNT') || DEFAULT_ADMIN_ACCOUNT
const adminParsed = normalizeAccountId(adminRaw)
if (!adminParsed) {
  throw new Error(`VITE_ADMIN_ACCOUNT must look like 0.0.12345, got "${adminRaw}"`)
}

/** Ids from VITE_TREASURY_ACCOUNTS; empty entries are ignored, garbage refuses. */
function parseTreasuryList(raw: string): string[] {
  if (raw.length === 0) return []
  const ids = raw.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
  for (const id of ids) {
    if (!normalizeAccountId(id)) throw new Error(`VITE_TREASURY_ACCOUNTS contains something that is not an account id: "${id}"`)
  }
  return [...new Set(ids.map((id) => normalizeAccountId(id) as string))]
}

export const config = {
  network,
  profile,
  adminAccount: adminParsed,
  /** authoritative when non-empty; discovery fills the gap when it is not */
  configuredTreasuryAccounts: parseTreasuryList(read('VITE_TREASURY_ACCOUNTS')),
  /** WalletConnect Cloud project id; without it the wallet handshake cannot start. */
  walletConnectProjectId: read('VITE_WALLETCONNECT_PROJECT_ID'),
}

/** Everything the connect button needs to be honest about its readiness. */
export const walletReady = config.walletConnectProjectId.length > 0

/**
 * `?account=0.0.x` in the URL: a preview override, prepended to the
 * selector's options. It is how the page can be exercised against any
 * account before a treasury is pinned into the config — documented in the
 * README. Nothing else in the app reads location.search.
 */
export function urlAccountOverride(search: string = typeof location === 'undefined' ? '' : location.search): string | null {
  const raw = new URLSearchParams(search).get('account')
  return raw ? normalizeAccountId(raw) : null
}
