import { useEffect, useState } from 'react'
import { config } from '../config'
import { fetchAccountIdsByPublicKey } from '../lib/mirror'

/**
 * Signers are configured as keys, but people recognise accounts. This maps a
 * raw public key to the account that holds it, read from the mirror's
 * `account.publickey` filter — the same lookup the schedule discovery uses.
 *
 * A key can have no account (a fresh key) or several (a key on more than one
 * account); the first answer is shown and the key stays the fallback, so a
 * signer row never goes blank.
 */
export function useKeyAccounts(rawKeys: readonly string[]): ReadonlyMap<string, string> {
  const [accounts, setAccounts] = useState<ReadonlyMap<string, string>>(new Map())
  // Keys arrive as a fresh array every render; the joined string is the real input.
  const key = rawKeys.join(',')

  useEffect(() => {
    if (key.length === 0) {
      setAccounts(new Map())
      return
    }
    let cancelled = false
    const raws = key.split(',')

    void Promise.all(
      raws.map(async (raw) => {
        const ids = await fetchAccountIdsByPublicKey(config.network, raw).catch(() => [])
        return [raw, ids[0] ?? null] as const
      }),
    ).then((pairs) => {
      if (cancelled) return
      const next = new Map<string, string>()
      for (const [raw, accountId] of pairs) {
        if (accountId) next.set(raw, accountId)
      }
      setAccounts(next)
    })

    return () => {
      cancelled = true
    }
  }, [key])

  return accounts
}
