/**
 * The USD figure beside the balance. CoinGecko's simple-price endpoint is
 * the only rate source; the fetch is cached for 60 seconds so a visitor
 * refreshing the page cannot lean on it, and the UI labels the number with
 * its timestamp and source because an undated price is a made-up price.
 *
 * Money math stays in BigInt: the rate becomes micro-USD per HBAR, the
 * product divides by 100 million tinybars, and rounding happens once, at the
 * cent.
 */

export const COINGECKO_URL =
  'https://api.coingecko.com/api/v1/simple/price?ids=hedera-hashgraph&vs_currencies=usd'

export const PRICE_CACHE_MS = 60_000
export const PRICE_SOURCE_LABEL = 'CoinGecko'

export interface UsdPrice {
  /** USD per 1 HBAR */
  readonly usdPerHbar: number
  /** epoch milliseconds of the fetch the UI prints */
  readonly fetchedAt: number
}

export type PriceResult = { ok: true; price: UsdPrice } | { ok: false; error: string }

export interface PriceFetchOptions {
  fetchImpl?: typeof fetch
  now?: () => number
  /** test seam: bypass and skip the shared cache */
  useCache?: boolean
}

let cached: UsdPrice | null = null

export function invalidateUsdPriceCache(): void {
  cached = null
}

export async function fetchUsdPrice(options: PriceFetchOptions = {}): Promise<PriceResult> {
  const { fetchImpl = fetch, now = () => Date.now(), useCache = true } = options
  if (useCache && cached && now() - cached.fetchedAt < PRICE_CACHE_MS) {
    return { ok: true, price: cached }
  }
  try {
    const res = await fetchImpl(COINGECKO_URL, { headers: { accept: 'application/json' } })
    if (!res.ok) return { ok: false, error: `The rate service answered ${res.status}.` }
    const body = (await res.json()) as Record<string, { usd?: number } | undefined>
    const usd = body['hedera-hashgraph']?.usd
    if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) {
      return { ok: false, error: 'The rate service did not return a usable price.' }
    }
    const price: UsdPrice = { usdPerHbar: usd, fetchedAt: now() }
    cached = price
    return { ok: true, price }
  } catch {
    return { ok: false, error: 'Could not reach the rate service.' }
  }
}

/**
 * Tinybars → `$1,234.56`, exact to the cent. The rate is pinned to micro-USD
 * per HBAR so no float ever multiplies the balance itself.
 */
export function formatUsd(tinybars: bigint, usdPerHbar: number): string {
  const sign = tinybars < 0n ? '−' : ''
  const magnitude = tinybars < 0n ? -tinybars : tinybars
  const rateMicro = BigInt(Math.round(usdPerHbar * 1_000_000))
  const microUsd = (magnitude * rateMicro) / 100_000_000n
  const cents = (microUsd + 5_000n) / 10_000n
  const whole = cents / 100n
  const rest = String(cents % 100n).padStart(2, '0')
  const grouped = groupDigits(whole)
  return `${sign}$${grouped}.${rest}`
}

function groupDigits(whole: bigint): string {
  const digits = whole.toString()
  const parts: string[] = []
  for (let end = digits.length; end > 0; end -= 3) {
    parts.unshift(digits.slice(Math.max(0, end - 3), end))
  }
  return parts.join(',')
}
