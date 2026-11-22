import { describe, expect, it } from 'vitest'
import { PRICE_SOURCE_LABEL, fetchUsdPrice, formatUsd, invalidateUsdPriceCache } from './price'

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response

describe('fetchUsdPrice', () => {
  it('reads the rate and stamps the fetch time', async () => {
    invalidateUsdPriceCache()
    let clock = 1_795_000_000_000
    const result = await fetchUsdPrice({
      useCache: false,
      now: () => clock,
      fetchImpl: (async () => jsonResponse({ 'hedera-hashgraph': { usd: 0.1619 } })) as unknown as typeof fetch,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.price.usdPerHbar).toBe(0.1619)
      expect(result.price.fetchedAt).toBe(clock)
    }
  })

  it('answers from the 60 s cache without a second call', async () => {
    invalidateUsdPriceCache()
    let calls = 0
    let clock = 1_795_000_000_000
    const fetchImpl = (async () => {
      calls += 1
      return jsonResponse({ 'hedera-hashgraph': { usd: 0.2 } })
    }) as unknown as typeof fetch
    await fetchUsdPrice({ now: () => clock, fetchImpl })
    clock += 59_000
    const cached = await fetchUsdPrice({ now: () => clock, fetchImpl })
    expect(calls).toBe(1)
    if (cached.ok) expect(cached.price.fetchedAt).toBe(1_795_000_000_000) // the old stamp, not the new now
    clock += 2_000
    await fetchUsdPrice({ now: () => clock, fetchImpl })
    expect(calls).toBe(2) // past 60 s the cache is cold
    invalidateUsdPriceCache()
  })

  it('turns every failure into a sentence, never a throw', async () => {
    invalidateUsdPriceCache()
    const down = await fetchUsdPrice({
      useCache: false,
      fetchImpl: (async () => jsonResponse({}, 429)) as unknown as typeof fetch,
    })
    expect(down.ok).toBe(false)
    if (!down.ok) expect(down.error).toMatch(/answered 429/)

    const junk = await fetchUsdPrice({
      useCache: false,
      fetchImpl: (async () => jsonResponse({ 'hedera-hashgraph': { usd: 'free money' } })) as unknown as typeof fetch,
    })
    expect(junk.ok).toBe(false)

    const unreachable = await fetchUsdPrice({
      useCache: false,
      fetchImpl: (async () => {
        throw new Error('ECONNRESET')
      }) as unknown as typeof fetch,
    })
    expect(unreachable.ok).toBe(false)
    if (!unreachable.ok) expect(unreachable.error).toMatch(/reach/)
  })

  it('names its source, because an undated price is a made-up price', () => {
    expect(PRICE_SOURCE_LABEL).toBe('CoinGecko')
  })
})

describe('formatUsd', () => {
  it('multiplies through BigInt micro-USD, exact to the cent', () => {
    expect(formatUsd(100_000_000n, 0.1619)).toBe('$0.16')
    expect(formatUsd(100_000_000n, 0.1699)).toBe('$0.17') // cent rounding up
    expect(formatUsd(1n, 0.1619)).toBe('$0.00') // a tinybar is a fraction of a cent
    expect(formatUsd(0n, 0.1619)).toBe('$0.00')
  })

  it('groups thousands and keeps signs', () => {
    expect(formatUsd(123_456_700_000_000n, 1)).toBe('$1,234,567.00')
    expect(formatUsd(-100_000_000n, 2)).toBe('−$2.00')
  })

  it('is exact on the live fixture balance', () => {
    // 11,488.73401242 HBAR at $0.1619 → 11488.73401242 × 0.1619 = 1,860.0260366… → $1,860.03
    expect(formatUsd(1_148_873_401_242n, 0.1619)).toBe('$1,860.03')
  })

  it('does not let a float touch the balance itself', () => {
    // 1 HBAR at a rate whose float form is inexact must still land exactly.
    expect(formatUsd(100_000_000n, 0.07)).toBe('$0.07')
    expect(formatUsd(3_000_000_000n, 0.07)).toBe('$2.10') // 30 × 0.07 = 2.1, and 0.1+0.7 floats lie about this
  })
})
