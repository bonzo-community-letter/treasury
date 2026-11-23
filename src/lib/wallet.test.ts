import { describe, expect, it, vi } from 'vitest'
import {
  deepLinkFor,
  hasConnectedBefore,
  isMobileWalletTarget,
  isWalletReturn,
  pollForSession,
  rememberedExtension,
  walletLink,
  walletLinks,
} from './wallet'

describe('rememberedExtension', () => {
  it('is null without browser storage — nothing is assumed', () => {
    expect(rememberedExtension()).toBeNull()
    expect(hasConnectedBefore()).toBe(false)
  })

  const withMarker = (value: string | null): void => {
    const store = new Map<string, string>()
    if (value !== null) store.set('treasury.wallet.extension', value)
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, next: string) => void store.set(key, next),
        removeItem: (key: string) => void store.delete(key),
        key: (index: number) => [...store.keys()][index] ?? null,
        get length() {
          return store.size
        },
        clear: () => store.clear(),
      },
    })
  }

  const withoutStorage = (): void => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined })
  }

  it('reads a legacy bare kind as an extension', () => {
    withMarker('hashpack')
    expect(rememberedExtension()).toBe('hashpack')
    expect(hasConnectedBefore()).toBe(true)
    withoutStorage()
  })

  it('knows the road, and only an extension road is an extension', () => {
    withMarker('hashpack:extension')
    expect(rememberedExtension()).toBe('hashpack')
    withMarker('hashpack:deep-link')
    expect(rememberedExtension()).toBeNull()
    expect(hasConnectedBefore()).toBe(true)
    withMarker('walletconnect:dialog')
    expect(rememberedExtension()).toBeNull()
    expect(hasConnectedBefore()).toBe(true)
    withoutStorage()
  })
})

describe('deepLinkFor', () => {
  it('builds the scheme form for an app and the path form for a site', () => {
    expect(deepLinkFor('hashpack:', 'wc:abc@2?relay=1')).toBe('hashpack://wc?uri=wc%3Aabc%402%3Frelay%3D1')
    expect(deepLinkFor('hashpack://', 'wc:abc@2')).toBe('hashpack://wc?uri=wc%3Aabc%402')
    expect(deepLinkFor('https://hashpack.app/', 'wc:abc@2')).toBe('https://hashpack.app/wc?uri=wc%3Aabc%402')
  })
})

describe('walletLinks', () => {
  const listing = (mobile: { native?: string; universal?: string }): typeof fetch =>
    (async () =>
      new Response(
        JSON.stringify({
          listings: {
            abc: { slug: 'hashpack', name: 'HashPack', mobile },
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch

  it('keeps both links the registry publishes', async () => {
    const links = await walletLinks(
      'hashpack',
      'project',
      listing({ native: 'hashpack:', universal: 'https://hashpack.app' }),
    )
    expect(links).toEqual({ native: 'hashpack:', universal: 'https://hashpack.app' })
  })

  it('opens the app, not its website, when both exist', async () => {
    const link = await walletLink(
      'hashpack',
      'project',
      listing({ native: 'hashpack:', universal: 'https://hashpack.app' }),
    )
    expect(link).toBe('hashpack:')
  })

  it('falls back to the universal link, then to nothing', async () => {
    expect(
      await walletLink('hashpack', 'project', listing({ universal: 'https://hashpack.app' })),
    ).toBe('https://hashpack.app')
    expect(await walletLink('hashpack', 'project', listing({}))).toBeNull()
  })

  it('answers nothing when the registry cannot be read', async () => {
    const failing = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
    expect(await walletLinks('kabila', 'project', failing)).toEqual({ native: null, universal: null })
  })
})

describe('isMobileWalletTarget', () => {
  it('knows a phone from a desktop', () => {
    expect(isMobileWalletTarget('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true)
    expect(isMobileWalletTarget('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(true)
    expect(isMobileWalletTarget('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false)
  })
})

describe('isWalletReturn', () => {
  it('reads the marker a wallet app comes back with', () => {
    expect(isWalletReturn('?wallet=return')).toBe(true)
    expect(isWalletReturn('?foo=1&wallet=return')).toBe(true)
    expect(isWalletReturn('?wallet=other')).toBe(false)
    expect(isWalletReturn('')).toBe(false)
  })
})

describe('pollForSession', () => {
  it('picks up a session that only arrives after the page is up', async () => {
    vi.useFakeTimers()
    try {
      const seen: string[] = []
      let reads = 0
      const stop = pollForSession(
        () => {
          reads += 1
          return reads >= 3 ? { accountId: '0.0.5', network: 'mainnet' as const } : null
        },
        (session) => seen.push(session.accountId),
        { intervalMs: 1_000, budgetMs: 10_000 },
      )
      await vi.advanceTimersByTimeAsync(3_500)
      expect(seen).toEqual(['0.0.5'])
      stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops at its budget instead of watching forever', async () => {
    vi.useFakeTimers()
    try {
      let reads = 0
      const seen: string[] = []
      const stop = pollForSession(
        () => {
          reads += 1
          return null
        },
        (session) => seen.push(session.accountId),
        { intervalMs: 1_000, budgetMs: 5_000 },
      )
      await vi.advanceTimersByTimeAsync(60_000)
      expect(seen).toEqual([])
      expect(reads).toBeLessThanOrEqual(6)
      stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does nothing after it was stopped', async () => {
    vi.useFakeTimers()
    try {
      const seen: string[] = []
      const stop = pollForSession(
        () => ({ accountId: '0.0.5', network: 'mainnet' as const }),
        (session) => seen.push(session.accountId),
        { intervalMs: 1_000, budgetMs: 10_000 },
      )
      stop()
      await vi.advanceTimersByTimeAsync(5_000)
      expect(seen).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})
