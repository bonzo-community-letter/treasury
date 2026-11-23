/**
 * The Hedera constants that do not depend on which app this is: the network
 * type, the public mirror nodes, the explorer. Ported from the treasury
 * console repo (which lifted them from the open-letter repo's lib/hcs.ts).
 */

export type HederaNetwork = 'mainnet' | 'testnet'

export const MIRROR_BASE: Record<HederaNetwork, string> = {
  mainnet: 'https://mainnet-public.mirrornode.hedera.com/api/v1',
  testnet: 'https://testnet.mirrornode.hedera.com/api/v1',
}

/** Block explorer, per network — the same switch as the mirror node. */
export const HASHSCAN_BASE: Record<HederaNetwork, string> = {
  mainnet: 'https://hashscan.io/mainnet',
  testnet: 'https://hashscan.io/testnet',
}

const ACCOUNT_ID = /^\d+\.\d+\.\d+$/

export function isAccountId(value: string): boolean {
  return ACCOUNT_ID.test(value.trim())
}

/** The account id as the chain wants it, or null when it is not one. */
export function normalizeAccountId(value: string): string | null {
  const trimmed = value.trim()
  return ACCOUNT_ID.test(trimmed) ? trimmed : null
}

/** Explorer URL for an account. */
export function hashscanAccountUrl(network: HederaNetwork, accountId: string): string {
  return `${HASHSCAN_BASE[network]}/account/${accountId}`
}

/** Explorer URL for a schedule entity. */
export function hashscanScheduleUrl(network: HederaNetwork, scheduleId: string): string {
  return `${HASHSCAN_BASE[network]}/schedule/${scheduleId}`
}

/**
 * Explorer URL for a transaction. HashScan wants the id with `@` and `.`
 * (`0.0.1234@1700000000.000000000`); wallets hand it over with dashes.
 * A bare consensus timestamp (`1700000000.000000000`) is also a valid path —
 * that is how an executed schedule's transaction is linked.
 */
export function hashscanTransactionUrl(network: HederaNetwork, transactionId: string): string {
  const normalized = transactionId.includes('@')
    ? transactionId
    : transactionId.replace(/^(\d+\.\d+\.\d+)-(\d+)-(\d+)$/, '$1@$2.$3')
  return `${HASHSCAN_BASE[network]}/transaction/${normalized}`
}

/**
 * The mirror's id form: `0.0.1234-1700000000-000000000`. The SDK and the
 * wallets hand over `0.0.1234@1700000000.000000000`, which the mirror answers
 * with HTTP 400 — so a receipt lookup on that form never matches and the
 * submit appears to hang until the poll budget runs out.
 */
export function mirrorTransactionId(transactionId: string): string {
  return transactionId.replace(/^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/, '$1-$2-$3')
}

/** Explorer URL for the transaction a schedule executed, by consensus timestamp. */
export function hashscanTimestampUrl(network: HederaNetwork, consensusTimestamp: string): string {
  return `${HASHSCAN_BASE[network]}/transaction/${consensusTimestamp}`
}
