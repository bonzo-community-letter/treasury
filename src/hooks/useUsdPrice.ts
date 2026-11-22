import { useCallback, useEffect, useState } from 'react'
import { fetchUsdPrice, PRICE_CACHE_MS, type UsdPrice } from '../lib/price'

export interface PriceApi {
  price: UsdPrice | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * The USD rate, refetched when the cache window passes. The 60-second rule
 * lives in `lib/price.ts`; this hook only decides WHEN to ask — on mount, on
 * an explicit refresh, and nowhere else automatically (a stats page that
 * spams a free API is a page that loses its rate source).
 */
export function useUsdPrice(): PriceApi {
  const [price, setPrice] = useState<UsdPrice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((bypassCache: boolean) => {
    setLoading(true)
    void fetchUsdPrice(bypassCache ? { useCache: false } : {}).then((result) => {
      setLoading(false)
      if (result.ok) {
        setPrice(result.price)
        setError(null)
      } else {
        setError(result.error)
      }
    })
  }, [])

  useEffect(() => {
    load(false)
  }, [load])

  const refresh = useCallback(() => {
    // A refresh inside the cache window is honored anyway — the button says
    // "refresh", and one call per visitor per click is within the spirit.
    load(true)
  }, [load])

  return { price, loading, error, refresh }
}

export { PRICE_CACHE_MS }
