import type { MirrorTransactionRow, MirrorTransfer } from './mirror'

/**
 * The recent-transactions table, derived from the mirror's `transfers` list.
 *
 * The mirror row says which accounts moved and by how much, including the
 * node fee (0.0.802 / 0.0.981 collect it) — the table wants the account on
 * the other side of the treasury's movement. The derivation rule:
 *
 *   treasury moved OUT  → the largest credit among the other accounts
 *   treasury moved IN   → the largest debit among the other accounts
 *   treasury unchanged  → the largest absolute movement that is not a fee
 *
 * The fee collector only ever takes a fee (positive), so the sign rule never
 * names it as a counterparty on an in/out row — and the two known fee
 * accounts are excluded outright.
 */

/** Mainnet and testnet node-fee collection accounts. */
const FEE_ACCOUNTS = new Set(['0.0.802', '0.0.800', '0.0.702', '0.0.981', '0.0.982', '0.0.983'])

export interface TxSummary {
  readonly transactionId: string
  readonly type: string
  readonly result: string
  readonly consensusSec: number | null
  readonly counterparty: string | null
  /** the treasury's own net movement, or null when it is not a party */
  readonly treasuryDelta: bigint | null
  readonly scheduled: boolean
  readonly entityId: string | null
}

export function treasuryDelta(treasuryId: string, transfers: readonly MirrorTransfer[]): bigint | null {
  const legs = transfers.filter((leg) => leg.account === treasuryId)
  if (legs.length === 0) return null
  return legs.reduce((sum, leg) => sum + leg.amount, 0n)
}

export function counterpartyOf(
  treasuryId: string,
  transfers: readonly MirrorTransfer[],
  delta: bigint | null,
): string | null {
  const others = transfers.filter((leg) => leg.account !== treasuryId && !FEE_ACCOUNTS.has(leg.account))
  if (others.length === 0) return null
  if (delta !== null && delta < 0n) {
    const credits = others.filter((leg) => leg.amount > 0n)
    if (credits.length > 0) return maxBy(credits, (leg) => leg.amount)!.account
  }
  if (delta !== null && delta > 0n) {
    const debits = others.filter((leg) => leg.amount < 0n)
    if (debits.length > 0) return maxBy(debits, (leg) => -leg.amount)!.account
  }
  const nonZero = others.filter((leg) => leg.amount !== 0n)
  const pool = nonZero.length > 0 ? nonZero : others
  return maxBy(pool, (leg) => (leg.amount < 0n ? -leg.amount : leg.amount))!.account
}

function maxBy<T>(items: readonly T[], score: (item: T) => bigint): T | null {
  let best: T | null = null
  let bestScore: bigint | null = null
  for (const item of items) {
    const value = score(item)
    if (bestScore === null || value > bestScore) {
      best = item
      bestScore = value
    }
  }
  return best
}

/** Map and trim mirror rows into table data, newest first, capped at `limit`. */
export function summarizeTransactions(
  treasuryId: string,
  rows: readonly MirrorTransactionRow[],
  limit = 15,
): TxSummary[] {
  return rows
    .slice(0, limit)
    .map((row) => {
      const delta = treasuryDelta(treasuryId, row.transfers)
      return {
        transactionId: row.transactionId,
        type: row.name,
        result: row.result,
        consensusSec: secondsOf(row.consensusTimestamp),
        counterparty: counterpartyOf(treasuryId, row.transfers, delta),
        treasuryDelta: delta,
        scheduled: row.scheduled,
        entityId: row.entityId,
      }
    })
}

function secondsOf(timestamp: string): number | null {
  const [seconds] = timestamp.split('.')
  const value = Number(seconds)
  return Number.isFinite(value) ? value : null
}
