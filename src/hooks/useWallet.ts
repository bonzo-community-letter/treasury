import { useCallback, useEffect, useRef, useState } from 'react'
import {
  connect as openSession,
  describeWalletError,
  disconnect as closeSessions,
  hasConnectedBefore,
  hasStoredSession,
  restore,
  type ConnectRoute,
  type WalletKind,
} from '../lib/wallet'

export type WalletStatus = 'idle' | 'restoring' | 'connecting' | 'connected' | 'error'

export interface WalletState {
  status: WalletStatus
  accountId: string | null
  /** The wallet the user picked; null once a session was restored. */
  kind: WalletKind | null
  /** How the pairing is being made, once the attempt got that far. */
  route: ConnectRoute | null
  error: string | null
}

const IDLE: WalletState = { status: 'idle', accountId: null, kind: null, route: null, error: null }

export interface WalletApi extends WalletState {
  connect: (kind: WalletKind) => Promise<void>
  /** Abandon a connection attempt that is waiting on a wallet. */
  cancel: () => void
  disconnect: () => Promise<void>
}

/**
 * The wallet session as React state — the open-letter hook, behavior for
 * behavior. A session this browser already holds is picked up on mount
 * without prompting, but only if one is in storage, so a first-time visitor
 * never loads the wallet libraries at all. Nothing about the session is
 * persisted by this page.
 */
export function useWallet(): WalletApi {
  const [state, setState] = useState<WalletState>(IDLE)
  /** Bumped on cancel/disconnect, so a late wallet answer cannot revive a dead attempt. */
  const attempt = useRef(0)

  useEffect(() => {
    let cancelled = false

    const settle = (session: { accountId: string } | null): void => {
      if (cancelled || attempt.current !== 0) return
      setState(
        session
          ? { status: 'connected', accountId: session.accountId, kind: null, route: null, error: null }
          : IDLE,
      )
    }

    // A session this browser already holds is read back, never re-negotiated:
    // connector init rebuilds the signers from storage, and a wallet is not
    // asked anything. A browser that connected before (WalletConnect's own
    // storage, or an extension it used) is the only one that pays for it.
    if (!hasStoredSession() && !hasConnectedBefore()) return
    setState({ ...IDLE, status: 'restoring' })
    void restore().then(settle)

    return () => {
      cancelled = true
    }
  }, [])

  const connect = useCallback(async (kind: WalletKind) => {
    const current = ++attempt.current
    setState({ status: 'connecting', accountId: null, kind, route: null, error: null })
    try {
      const session = await openSession(kind, {
        onRoute: (route) => {
          if (attempt.current === current) setState((state) => ({ ...state, route }))
        },
      })
      if (attempt.current !== current) return
      setState({ status: 'connected', accountId: session.accountId, kind, route: null, error: null })
    } catch (error) {
      if (attempt.current !== current) return
      setState({ status: 'error', accountId: null, kind, route: null, error: describeWalletError(error) })
    }
  }, [])

  const cancel = useCallback(() => {
    attempt.current += 1
    setState(IDLE)
  }, [])

  const disconnect = useCallback(async () => {
    attempt.current += 1
    setState(IDLE)
    await closeSessions().catch(() => {
      // A session that cannot be closed is already gone as far as this page is concerned.
    })
  }, [])

  return { ...state, connect, cancel, disconnect }
}
