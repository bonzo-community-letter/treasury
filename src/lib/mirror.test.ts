import { describe, expect, it } from 'vitest'
import { fetchMirrorTransactions, waitForCryptoCreate } from './mirror'

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response

const createRow = {
  transaction_id: '0.0.9-1700000000-000000001',
  name: 'CRYPTOCREATE',
  result: 'SUCCESS',
  entity_id: '0.0.4455',
  consensus_timestamp: '1700000001.000000002',
}

describe('fetchMirrorTransactions', () => {
  it('maps the create row: status verbatim, entity id as the new account', async () => {
    const rows = await fetchMirrorTransactions(
      'testnet',
      '0.0.9-1700000000-000000001',
      (async () => jsonResponse({ transactions: [createRow] })) as unknown as typeof fetch,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      transactionId: '0.0.9-1700000000-000000001',
      name: 'CRYPTOCREATE',
      result: 'SUCCESS',
      entityId: '0.0.4455',
      consensusTimestamp: '1700000001.000000002',
      scheduled: false,
      transfers: [],
    })
  })

  it('treats an unknown transaction as empty, not as failure', async () => {
    const rows = await fetchMirrorTransactions(
      'testnet',
      '0.0.9-1-1',
      (async () => jsonResponse({ transactions: [] }, 404)) as unknown as typeof fetch,
    )
    expect(rows).toEqual([])
  })

  it('drops malformed rows instead of inventing a receipt', async () => {
    const rows = await fetchMirrorTransactions(
      'testnet',
      '0.0.9-1-1',
      (async () => jsonResponse({ transactions: [{ nope: true }, createRow] })) as unknown as typeof fetch,
    )
    expect(rows).toHaveLength(1)
  })
})

describe('waitForCryptoCreate', () => {
  const noSleep = async (): Promise<void> => undefined

  it('returns the create row once it appears', async () => {
    let calls = 0
    const tx = await waitForCryptoCreate(
      'mainnet',
      '0.0.9-1700000000-000000001',
      {
        sleep: noSleep,
        fetchImpl: (async () => {
          calls += 1
          if (calls < 3) return jsonResponse({ transactions: [] }, 404)
          return jsonResponse({ transactions: [{ ...createRow, name: 'CRYPTOTRANSFER' }, createRow] })
        }) as unknown as typeof fetch,
      },
    )
    expect(tx?.result).toBe('SUCCESS')
    expect(tx?.entityId).toBe('0.0.4455')
    expect(calls).toBe(3)
  })

  it('hands back a failed status verbatim — INSUFFICIENT_PAYER_BALANCE and friends', async () => {
    const tx = await waitForCryptoCreate(
      'mainnet',
      '0.0.9-1-1',
      {
        sleep: noSleep,
        fetchImpl: (async () =>
          jsonResponse({
            transactions: [{ ...createRow, result: 'INSUFFICIENT_PAYER_BALANCE', entity_id: null }],
          })) as unknown as typeof fetch,
      },
    )
    expect(tx?.result).toBe('INSUFFICIENT_PAYER_BALANCE')
  })

  it('gives up with null when nothing is indexed within the budget', async () => {
    let calls = 0
    const tx = await waitForCryptoCreate(
      'mainnet',
      '0.0.9-1-1',
      {
        budgetMs: 40_000,
        delayMs: 2_000,
        sleep: noSleep,
        fetchImpl: (async () => {
          calls += 1
          return jsonResponse({ transactions: [] }, 404)
        }) as unknown as typeof fetch,
      },
    )
    // the budget is 20 polls — patience that is counted, not imagined
    expect(tx).toBeNull()
    expect(calls).toBe(20)
  })

  it('stops early when the caller aborts', async () => {
    let calls = 0
    const tx = await waitForCryptoCreate(
      'mainnet',
      '0.0.9-1-1',
      {
        aborted: () => calls >= 1,
        sleep: noSleep,
        fetchImpl: (async () => {
          calls += 1
          return jsonResponse({ transactions: [] }, 404)
        }) as unknown as typeof fetch,
      },
    )
    expect(tx).toBeNull()
    expect(calls).toBe(1)
  })

  it('survives a throwing fetch — a flaky read is not an answer', async () => {
    let calls = 0
    const tx = await waitForCryptoCreate(
      'mainnet',
      '0.0.9-1-1',
      {
        sleep: noSleep,
        fetchImpl: (async () => {
          calls += 1
          if (calls === 1) throw new Error('ECONNRESET')
          return jsonResponse({ transactions: [createRow] })
        }) as unknown as typeof fetch,
      },
    )
    expect(tx?.entityId).toBe('0.0.4455')
  })
})
