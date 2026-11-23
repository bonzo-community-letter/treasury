import { MIRROR_BASE, mirrorTransactionId, type HederaNetwork } from './hedera'
import type { MirrorKeyObject } from './accountKey'
import { secondsOfTimestamp } from './time'

/**
 * Reading the chain back — all of it the public mirror node REST API, which
 * needs no key and is the only third-party read this page makes besides the
 * CoinGecko rate. Ported from the treasury console and widened to everything
 * the stats layer and the schedule flow need:
 *
 *   /accounts/{id}          balance + key structure
 *   /transactions           recent activity and the post-submit receipt read
 *   /schedules?account.id=  pending schedules (matches the CREATOR only —
 *                           verified live: a payer-only match returns empty)
 *   /schedules/{id}         signatures, execution, expiry, transaction body
 *
 * Every function takes an injectable `fetchImpl`; nothing here touches the
 * network in tests.
 */

export interface MirrorAccount {
  readonly accountId: string
  readonly balanceTinybars: bigint | null
  readonly key: MirrorKeyObject | null
  readonly memo: string
  readonly deleted: boolean
}

interface RawMirrorAccount {
  account?: string
  balance?: { balance?: number | string } | null
  key?: MirrorKeyObject | null
  memo?: string
  deleted?: boolean
}

function toBigInt(value: number | string | null | undefined): bigint | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return /^[+-]?\d+$/.test(value) ? BigInt(value) : null
  return Number.isSafeInteger(value) ? BigInt(value) : null
}

/** One account, or null when the mirror does not know the id. */
export async function fetchMirrorAccount(
  network: HederaNetwork,
  accountId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MirrorAccount | null> {
  const res = await fetchImpl(`${MIRROR_BASE[network]}/accounts/${encodeURIComponent(accountId)}`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) return null
  const body = (await res.json()) as RawMirrorAccount
  if (typeof body.account !== 'string') return null
  return {
    accountId: body.account,
    balanceTinybars: toBigInt(body.balance?.balance),
    key: body.key ?? null,
    memo: typeof body.memo === 'string' ? body.memo : '',
    deleted: body.deleted === true,
  }
}

export interface MirrorTransfer {
  readonly account: string
  readonly amount: bigint
}

export interface MirrorTransactionRow {
  readonly transactionId: string
  readonly name: string
  readonly result: string
  readonly entityId: string | null
  readonly consensusTimestamp: string
  readonly scheduled: boolean
  readonly transfers: readonly MirrorTransfer[]
}

interface RawMirrorTransfer {
  account?: string
  amount?: number | string
}

interface RawMirrorTransaction {
  transaction_id?: string
  name?: string
  result?: string
  entity_id?: string | null
  consensus_timestamp?: string
  scheduled?: boolean
  transfers?: RawMirrorTransfer[]
}

function toTransfer(raw: RawMirrorTransfer): MirrorTransfer | null {
  const amount = toBigInt(raw.amount ?? null)
  if (typeof raw.account !== 'string' || amount === null) return null
  return { account: raw.account, amount }
}

function toTransactionRow(raw: RawMirrorTransaction): MirrorTransactionRow | null {
  if (typeof raw.transaction_id !== 'string' || typeof raw.name !== 'string') return null
  return {
    transactionId: raw.transaction_id,
    name: raw.name,
    result: typeof raw.result === 'string' ? raw.result : '',
    entityId: typeof raw.entity_id === 'string' ? raw.entity_id : null,
    consensusTimestamp: typeof raw.consensus_timestamp === 'string' ? raw.consensus_timestamp : '',
    scheduled: raw.scheduled === true,
    transfers: (raw.transfers ?? [])
      .map(toTransfer)
      .filter((entry): entry is MirrorTransfer => entry !== null),
  }
}

/**
 * The mirror row(s) for one transaction id; an empty list means "not indexed
 * yet", not "failed".
 */
export async function fetchMirrorTransactions(
  network: HederaNetwork,
  transactionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MirrorTransactionRow[]> {
  // The mirror only accepts the dashed id; `@`/`.` is answered with HTTP 400.
  const url = `${MIRROR_BASE[network]}/transactions/${encodeURIComponent(mirrorTransactionId(transactionId))}`
  const res = await fetchImpl(url, { headers: { accept: 'application/json' } })
  if (!res.ok) return []
  const body = (await res.json()) as { transactions?: RawMirrorTransaction[] }
  return (body.transactions ?? [])
    .map(toTransactionRow)
    .filter((row): row is MirrorTransactionRow => row !== null)
}

/**
 * Recent activity for one account, newest first. The `transactiontype`
 * filter is NOT supported by the public mirror — callers filter client-side
 * by `name` (verified live).
 */
export async function fetchMirrorTransactionsByAccount(
  network: HederaNetwork,
  accountId: string,
  limit = 25,
  fetchImpl: typeof fetch = fetch,
): Promise<MirrorTransactionRow[]> {
  const params = new URLSearchParams({ 'account.id': accountId, limit: String(limit), order: 'desc' })
  const res = await fetchImpl(`${MIRROR_BASE[network]}/transactions?${params}`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) return []
  const body = (await res.json()) as { transactions?: RawMirrorTransaction[] }
  return (body.transactions ?? [])
    .map(toTransactionRow)
    .filter((row): row is MirrorTransactionRow => row !== null)
}

export interface MirrorSignature {
  readonly consensusTimestamp: string
  /** base64 of the signer's FULL raw public key — not just a prefix */
  readonly publicKeyPrefix: string
}

export interface MirrorSchedule {
  readonly scheduleId: string
  /** when the schedule was created (the row's consensus timestamp) */
  readonly createdTimestamp?: string | null
  readonly creatorAccountId: string | null
  readonly payerAccountId: string | null
  readonly executedTimestamp: string | null
  readonly expirationTime: string | null
  readonly deleted: boolean
  readonly memo: string
  /** base64 `proto.SchedulableTransactionBody` — the scheduled transaction */
  readonly transactionBody: string | null
  readonly signatures: readonly MirrorSignature[]
}

interface RawMirrorSignature {
  consensus_timestamp?: string
  public_key_prefix?: string
}

interface RawMirrorSchedule {
  consensus_timestamp?: string
  schedule_id?: string
  creator_account_id?: string | null
  payer_account_id?: string | null
  executed_timestamp?: string | null
  expiration_time?: string | null
  deleted?: boolean
  memo?: string
  transaction_body?: string | null
  signatures?: RawMirrorSignature[]
}

function toSchedule(raw: RawMirrorSchedule): MirrorSchedule | null {
  if (typeof raw.schedule_id !== 'string') return null
  return {
    scheduleId: raw.schedule_id,
    createdTimestamp: typeof raw.consensus_timestamp === 'string' ? raw.consensus_timestamp : null,
    creatorAccountId: typeof raw.creator_account_id === 'string' ? raw.creator_account_id : null,
    payerAccountId: typeof raw.payer_account_id === 'string' ? raw.payer_account_id : null,
    executedTimestamp: typeof raw.executed_timestamp === 'string' ? raw.executed_timestamp : null,
    expirationTime: typeof raw.expiration_time === 'string' ? raw.expiration_time : null,
    deleted: raw.deleted === true,
    memo: typeof raw.memo === 'string' ? raw.memo : '',
    transactionBody: typeof raw.transaction_body === 'string' ? raw.transaction_body : null,
    signatures: (raw.signatures ?? [])
      .filter((entry) => typeof entry.public_key_prefix === 'string')
      .map((entry) => ({
        consensusTimestamp: typeof entry.consensus_timestamp === 'string' ? entry.consensus_timestamp : '',
        publicKeyPrefix: entry.public_key_prefix as string,
      })),
  }
}

/**
 * Schedules whose CREATOR is the given account. (Verified live on the public
 * mirror: `account.id` matches the creator, not the payer, and not accounts
 * mentioned inside the scheduled body.)
 */
export async function fetchMirrorSchedulesByAccount(
  network: HederaNetwork,
  accountId: string,
  limit = 100,
  fetchImpl: typeof fetch = fetch,
): Promise<MirrorSchedule[]> {
  const params = new URLSearchParams({ 'account.id': accountId, limit: String(limit) })
  const res = await fetchImpl(`${MIRROR_BASE[network]}/schedules?${params}`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) return []
  const body = (await res.json()) as { schedules?: RawMirrorSchedule[] }
  return (body.schedules ?? []).map(toSchedule).filter((s): s is MirrorSchedule => s !== null)
}

/**
 * Accounts that hold a given raw public key. Signers are configured as keys,
 * not as account ids, so this is the bridge: it turns each treasury key into
 * the account(s) that can create schedules with it. (Verified live: the
 * mirror's `account.publickey` filter answers with raw hex for both curves.)
 */
export async function fetchAccountIdsByPublicKey(
  network: HederaNetwork,
  rawKeyHex: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const params = new URLSearchParams({ 'account.publickey': rawKeyHex, limit: '5' })
  const res = await fetchImpl(`${MIRROR_BASE[network]}/accounts?${params}`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) return []
  const body = (await res.json()) as { accounts?: { account?: string }[] }
  return (body.accounts ?? [])
    .map((row) => row.account)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

/** The live state of one schedule — the authority on signatures and status. */
export async function fetchMirrorSchedule(
  network: HederaNetwork,
  scheduleId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MirrorSchedule | null> {
  const res = await fetchImpl(`${MIRROR_BASE[network]}/schedules/${encodeURIComponent(scheduleId)}`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) return null
  return toSchedule((await res.json()) as RawMirrorSchedule)
}

/** The created account for a CRYPTOCREATE(ACCOUNT) row. */
export interface CreatedAccountRow extends MirrorTransactionRow {}

export interface WaitOptions {
  /** total patience; the mirror indexes a second after consensus, usually */
  budgetMs?: number
  delayMs?: number
  sleep?: (ms: number) => Promise<void>
  fetchImpl?: typeof fetch
  /** stop returning null and bail early (disconnect, unmount) */
  aborted?: () => boolean
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Poll until a row with one of these names appears with a status, or the
 * budget runs out. The budget is counted in polls (budgetMs / delayMs), not
 * on a wall clock — so the patience is exact and the function stays testable
 * with an injected sleep. Returns null on timeout or abort — the caller then
 * says "submitted, could not verify locally" instead of inventing a SUCCESS.
 *
 * `CRYPTOCREATE` and `CRYPTOCREATEACCOUNT` are listed together because the
 * mirror's per-transaction rows have spelled the create differently; matching
 * either is the belt-and-braces read. (Discovery of treasuries uses
 * `CRYPTOCREATEACCOUNT`, the spelling on the account list — verified live.)
 */
export async function waitForTransaction(
  network: HederaNetwork,
  transactionId: string,
  names: readonly string[],
  options: WaitOptions = {},
): Promise<MirrorTransactionRow | null> {
  const { budgetMs = 45_000, delayMs = 2_000, sleep = defaultSleep, fetchImpl = fetch, aborted = () => false } = options
  const maxPolls = Math.max(1, Math.ceil(budgetMs / delayMs))
  for (let poll = 0; poll < maxPolls; poll += 1) {
    if (aborted()) return null
    try {
      const rows = await fetchMirrorTransactions(network, transactionId, fetchImpl)
      const match = rows.find((row) => names.includes(row.name) && row.result.length > 0)
      if (match) return match
    } catch {
      // A flaky read is not an answer; keep polling until the budget says stop.
    }
    if (poll + 1 >= maxPolls) return null
    await sleep(delayMs)
  }
  return null
}

/**
 * The first row of a transaction, whatever its name — for transactions whose
 * mirror name this page does not want to hardcode (a topic creation, say).
 */
export function waitForAnyTransaction(
  network: HederaNetwork,
  transactionId: string,
  options: WaitOptions = {},
): Promise<MirrorTransactionRow | null> {
  const { budgetMs = 45_000, delayMs = 2_000, sleep = defaultSleep, fetchImpl = fetch, aborted = () => false } = options
  const maxPolls = Math.max(1, Math.ceil(budgetMs / delayMs))
  return (async () => {
    for (let poll = 0; poll < maxPolls; poll += 1) {
      if (aborted()) return null
      try {
        const rows = await fetchMirrorTransactions(network, transactionId, fetchImpl)
        const match = rows.find((row) => row.result.length > 0)
        if (match) return match
      } catch {
        // A flaky read is not an answer; keep polling until the budget says stop.
      }
      if (poll + 1 >= maxPolls) return null
      await sleep(delayMs)
    }
    return null
  })()
}

export function waitForCryptoCreate(
  network: HederaNetwork,
  transactionId: string,
  options: WaitOptions = {},
): Promise<MirrorTransactionRow | null> {
  return waitForTransaction(network, transactionId, ['CRYPTOCREATE', 'CRYPTOCREATEACCOUNT'], options)
}

/** The `consensus_timestamp` seconds of a row, for sorting and display. */
export function rowSeconds(row: { consensusTimestamp: string }): number | null {
  return secondsOfTimestamp(row.consensusTimestamp)
}
