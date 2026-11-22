import { useEffect, useState } from 'react'
import { config } from '../config'
import { decodeMirrorKey, type TreasuryKeyStructure } from '../lib/accountKey'
import { fetchMirrorAccount } from '../lib/mirror'

export interface AccountKeyState {
  /** the account's decoded key structure, or null while unread / unreadable */
  structure: TreasuryKeyStructure | null
  /** if the account's own key is a single key: its raw hex; else null */
  singleRaw: string | null
  loading: boolean
  error: string | null
}

const EMPTY: AccountKeyState = { structure: null, singleRaw: null, loading: false, error: null }

/**
 * An account's key, read from the chain — the input the role decision is
 * made from. Pass null to watch nothing. Any re-read happens on id change
 * only; keys move rarely, and the mirror is not ours to hammer.
 */
export function useAccountKey(accountId: string | null): AccountKeyState {
  const [state, setState] = useState<AccountKeyState>(accountId ? { ...EMPTY, loading: true } : EMPTY)

  useEffect(() => {
    if (!accountId) {
      setState(EMPTY)
      return
    }
    let cancelled = false
    setState({ ...EMPTY, loading: true })
    void fetchMirrorAccount(config.network, accountId).then((account) => {
      if (cancelled) return
      if (!account) {
        setState({ ...EMPTY, error: 'The mirror does not know this account.' })
        return
      }
      const decoded = decodeMirrorKey(account.key)
      if (!decoded.ok) {
        setState({ ...EMPTY, error: decoded.error })
        return
      }
      const singleRaw = decoded.structure.keys.length === 1 ? decoded.structure.keys[0]!.raw : null
      setState({ structure: decoded.structure, singleRaw, loading: false, error: null })
    })
    return () => {
      cancelled = true
    }
  }, [accountId])

  return state
}
