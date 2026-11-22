import { describe, expect, it } from 'vitest'
import { counterpartyOf, summarizeTransactions, treasuryDelta } from './txSummary'
import type { MirrorTransactionRow, MirrorTransfer } from './mirror'

const leg = (account: string, amount: number | string): MirrorTransfer => ({ account, amount: BigInt(amount) })

function row(overrides: Partial<MirrorTransactionRow> & { transactionId: string }): MirrorTransactionRow {
  return {
    name: 'CRYPTOTRANSFER',
    result: 'SUCCESS',
    entityId: null,
    consensusTimestamp: '1795378893.593108104',
    scheduled: false,
    transfers: [],
    ...overrides,
  }
}

describe('treasuryDelta', () => {
  it('sums every leg the treasury has on one row', () => {
    const transfers = [leg('0.0.4486', -500), leg('0.0.4486', -100), leg('0.0.51', 600)]
    expect(treasuryDelta('0.0.4486', transfers)).toBe(-600n)
  })

  it('is null when the treasury is not a party', () => {
    expect(treasuryDelta('0.0.4486', [leg('0.0.51', 600)])).toBeNull()
  })
})

describe('counterpartyOf — the account on the other side', () => {
  it('an outflow names the biggest credit, never the node fee', () => {
    const transfers = [leg('0.0.4486', -610), leg('0.0.51', 500), leg('0.0.52', 10), leg('0.0.802', 100)]
    expect(counterpartyOf('0.0.4486', transfers, -610n)).toBe('0.0.51')
  })

  it('an inflow names the biggest debit', () => {
    const transfers = [leg('0.0.4486', 300), leg('0.0.77', -400), leg('0.0.702', 100)]
    expect(counterpartyOf('0.0.4486', transfers, 300n)).toBe('0.0.77')
  })

  it('no movement falls back to the largest absolute movement that is not a fee', () => {
    const transfers = [leg('0.0.4486', 0), leg('0.0.800', 5), leg('0.0.51', -5)]
    expect(counterpartyOf('0.0.4486', transfers, 0n)).toBe('0.0.51')
  })

  it('a fee-only row has no counterparty to show', () => {
    const transfers = [leg('0.0.4486', -100), leg('0.0.802', 100)]
    expect(counterpartyOf('0.0.4486', transfers, -100n)).toBeNull()
  })

  it('a row without the treasury is null-safe', () => {
    expect(counterpartyOf('0.0.4486', [], null)).toBeNull()
  })
})

describe('summarizeTransactions', () => {
  it('maps rows into table data with delta, counterparty and time', () => {
    const rows = [
      row({
        transactionId: '0.0.9-1-1',
        transfers: [leg('0.0.4486', -510), leg('0.0.51', 500), leg('0.0.802', 10)],
      }),
    ]
    const summaries = summarizeTransactions('0.0.4486', rows)
    expect(summaries).toHaveLength(1)
    const summary = summaries[0]!
    expect(summary.type).toBe('CRYPTOTRANSFER')
    expect(summary.result).toBe('SUCCESS')
    expect(summary.consensusSec).toBe(1_795_378_893)
    expect(summary.counterparty).toBe('0.0.51')
    expect(summary.treasuryDelta).toBe(-510n)
    expect(summary.transactionId).toBe('0.0.9-1-1')
  })

  it('caps at 15 rows — the last fifteen, newest first as the mirror gave them', () => {
    const rows = Array.from({ length: 20 }, (_, index) => row({ transactionId: `0.0.9-${index}-1` }))
    const summaries = summarizeTransactions('0.0.4486', rows)
    expect(summaries).toHaveLength(15)
    expect(summaries[0]!.transactionId).toBe('0.0.9-0-1')
  })

  it('keeps the scheduled flag and the created entity id', () => {
    const rows = [row({ transactionId: '0.0.9-2-1', name: 'CRYPTOCREATEACCOUNT', entityId: '0.0.4486', scheduled: true })]
    const [summary] = summarizeTransactions('0.0.4486', rows)
    expect(summary!.scheduled).toBe(true)
    expect(summary!.entityId).toBe('0.0.4486')
    expect(summary!.counterparty).toBeNull()
    expect(summary!.treasuryDelta).toBeNull()
  })
})
