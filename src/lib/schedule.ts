import { proto } from '@hiero-ledger/proto'
import { base64ToBytes, longToBigInt } from './bytes'
import { matchSignatures, type TreasuryKey, type TreasuryKeyStructure } from './accountKey'
import type { MirrorSchedule } from './mirror'
import { secondsOfTimestamp } from './time'

/**
 * The pending-schedule read. Everything the panel shows comes from the
 * mirror's schedule row — never from an assumption the app made at create
 * time:
 *
 *   signatures[]        who signed; public_key_prefix is base64 of the
 *                       signer's full raw public key (verified live: it
 *                       matches the schedule creator's own account key)
 *   executed_timestamp  the network's word that it ran
 *   expiration_time     the network's word on how long it may wait
 *   deleted             cancelled
 *   transaction_body    the scheduled transaction itself (base64
 *                       proto.SchedulableTransactionBody), which is how the
 *                       recipient and amount are known at all — the mirror
 *                       has no fields for them.
 *
 * A schedule belongs to a treasury when its decoded body debits the treasury
 * — that is the filter `treasurySchedules` applies, because the mirror can
 * only index a schedule by its creator.
 */

export type ScheduleStatus = 'pending' | 'executed' | 'expired' | 'cancelled'

export function scheduleStatus(schedule: MirrorSchedule, nowSec: number): ScheduleStatus {
  if (schedule.deleted) return 'cancelled'
  if (schedule.executedTimestamp) return 'executed'
  const expiry = secondsOfTimestamp(schedule.expirationTime)
  if (expiry !== null && nowSec > expiry) return 'expired'
  return 'pending'
}

export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = {
  pending: 'Awaiting signatures',
  executed: 'Executed',
  expired: 'Expired unsigned',
  cancelled: 'Cancelled',
}

export interface ScheduledTransfer {
  /** the credit side — who receives */
  readonly recipient: string
  /** the amount leaving the treasury, positive tinybars */
  readonly amountOutTinybars: bigint
}

export type DecodedBody =
  | { kind: 'transfer'; legs: ReadonlyArray<{ account: string; amount: bigint }> }
  | { kind: 'other' }

/** Decode `transaction_body` far enough to know what the schedule would do. */
export function decodeScheduledBody(bodyBase64: string | null): DecodedBody {
  if (!bodyBase64) return { kind: 'other' }
  try {
    const decoded = proto.SchedulableTransactionBody.decode(base64ToBytes(bodyBase64))
    const accountAmounts = decoded.cryptoTransfer?.transfers?.accountAmounts
    if (!accountAmounts || accountAmounts.length === 0) return { kind: 'other' }
    const legs = accountAmounts
      .filter((entry) => entry.accountID)
      .map((entry) => ({
        account: accountIdOf(entry.accountID!),
        amount: longToBigInt(entry.amount as never),
      }))
    return legs.length > 0 ? { kind: 'transfer', legs } : { kind: 'other' }
  } catch {
    return { kind: 'other' }
  }
}

function accountIdOf(id: { shardNum?: unknown; realmNum?: unknown; accountNum?: unknown }): string {
  const shard = longToBigInt(id.shardNum as never)
  const realm = longToBigInt(id.realmNum as never)
  const num = longToBigInt(id.accountNum as never)
  return `${shard.toString()}.${realm.toString()}.${num.toString()}`
}

/** The scheduled outflow from this treasury, or null (not this treasury's transfer). */
export function scheduledOutflow(body: DecodedBody, treasuryId: string): ScheduledTransfer | null {
  if (body.kind !== 'transfer') return null
  const debit = body.legs.find((leg) => leg.account === treasuryId && leg.amount < 0n)
  if (!debit) return null
  const credits = body.legs.filter((leg) => leg.amount > 0n && leg.account !== treasuryId)
  if (credits.length !== 1) return null
  return { recipient: credits[0]!.account, amountOutTinybars: -debit.amount }
}

/** The schedules list for one treasury: decodable, treasury-debiting only. */
export function treasurySchedules(schedules: readonly MirrorSchedule[], treasuryId: string): MirrorSchedule[] {
  return schedules.filter((schedule) => scheduledOutflow(decodeScheduledBody(schedule.transactionBody), treasuryId) !== null)
}

export interface SignerView {
  readonly key: TreasuryKey
  readonly signed: boolean
}

export interface PendingScheduleView {
  readonly schedule: MirrorSchedule
  readonly status: ScheduleStatus
  readonly transfer: ScheduledTransfer
  readonly signers: readonly SignerView[]
  /** signatures the network recorded (may include keys outside the list) */
  readonly collected: number
  readonly threshold: number
  readonly expirySec: number | null
  readonly executedTimestamp: string | null
}

/**
 * The view model for one pending schedule. `collected` is the network's own
 * count (`signatures.length`); the per-key checkmark matches base64 prefixes
 * against the treasury's keys.
 */
export function scheduleView(
  schedule: MirrorSchedule,
  treasuryId: string,
  structure: TreasuryKeyStructure,
  nowSec: number,
): PendingScheduleView | null {
  const transfer = scheduledOutflow(decodeScheduledBody(schedule.transactionBody), treasuryId)
  if (!transfer) return null
  const signedFlags = matchSignatures(structure, schedule.signatures)
  return {
    schedule,
    status: scheduleStatus(schedule, nowSec),
    transfer,
    signers: structure.keys.map((key, index) => ({ key, signed: signedFlags[index] === true })),
    collected: schedule.signatures.length,
    threshold: structure.threshold,
    expirySec: secondsOfTimestamp(schedule.expirationTime),
    executedTimestamp: schedule.executedTimestamp,
  }
}

/** Has this raw key already signed the schedule? (Drives the Sign button.) */
export function hasKeySigned(view: PendingScheduleView, rawHex: string | null): boolean {
  if (!rawHex) return false
  const needle = rawHex.toLowerCase()
  return view.signers.some((signer) => signer.key.raw === needle && signer.signed)
}

/** The raw key of the connected wallet, if it is one of this treasury's keys. */
export function keyOf(structure: TreasuryKeyStructure, rawHex: string | null): TreasuryKey | null {
  if (!rawHex) return null
  const needle = rawHex.toLowerCase()
  return structure.keys.find((key) => key.raw === needle) ?? null
}
