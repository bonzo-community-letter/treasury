import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from '../config'
import {
  fetchAccountIdsByPublicKey,
  fetchMirrorAccount,
  fetchMirrorSchedulesByAccount,
  fetchMirrorTransactionsByAccount,
  type MirrorAccount,
  type MirrorSchedule,
  type MirrorTransactionRow,
} from '../lib/mirror'
import { decodeMirrorKey } from '../lib/accountKey'
import { treasurySchedules } from '../lib/schedule'

const POLL_MS = 20_000
const TRANSACTIONS_LIMIT = 25
const SHOW_N = 15

export interface TreasurySnapshot {
  account: MirrorAccount | null
  transactions: MirrorTransactionRow[]
  /** schedules whose decoded body debits this treasury, deduped */
  schedules: MirrorSchedule[]
  updatedMs: number | null
  loading: boolean
  error: string | null
}

const EMPTY: TreasurySnapshot = {
  account: null,
  transactions: [],
  schedules: [],
  updatedMs: null,
  loading: false,
  error: null,
}

/**
 * Everything the stats layer shows, one snapshot, refetched every 20 seconds
 * and on demand. The pieces arrive together (parallel, allSettled): a slow
 * leg cannot blank out the balance.
 *
 * Schedule discovery: the mirror indexes a schedule only by its CREATOR, so
 * the pending list is the union of schedules created by the treasury and by
 * the accounts that hold its keys — filtered to those whose decoded body
 * debits the treasury.
 */
export function useTreasurySnapshot(
  treasuryId: string | null,
  connectedAccountId: string | null,
): TreasurySnapshotView {
  const [state, setState] = useState<TreasurySnapshot>(EMPTY)
  const [tick, setTick] = useState(0)
  const generation = useRef(0)

  useEffect(() => {
    if (!treasuryId) {
      setState(EMPTY)
      return
    }
    const mine = ++generation.current
    setState((prev) => ({ ...prev, loading: prev.account === null, error: null }))

    const load = async (): Promise<void> => {
      const [account, transactions] = await Promise.allSettled([
        fetchMirrorAccount(config.network, treasuryId),
        fetchMirrorTransactionsByAccount(config.network, treasuryId, TRANSACTIONS_LIMIT),
      ])
      if (generation.current !== mine) return

      const failures: string[] = []
      const accountValue = account.status === 'fulfilled' ? account.value : null
      if (account.status === 'rejected') failures.push('balance')
      const transactionsValue =
        transactions.status === 'fulfilled' ? transactions.value : []
      if (transactions.status === 'rejected') failures.push('transactions')

      // Signers are keys, not account ids. Resolve each treasury key to the
      // account(s) that hold it, so schedules created by any signer are found
      // — the mirror indexes a schedule only by its CREATOR, which is always
      // a signer, never the treasury itself.
      const decoded = accountValue ? decodeMirrorKey(accountValue.key) : null
      let signerAccounts: string[] = []
      if (decoded && decoded.ok) {
        const resolved = await Promise.allSettled(
          decoded.structure.keys.map((key) => fetchAccountIdsByPublicKey(config.network, key.raw)),
        )
        if (generation.current !== mine) return
        signerAccounts = [
          ...new Set(resolved.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))),
        ]
      }

      // Creators worth asking: the treasury itself, and every account that
      // holds one of its keys (a schedule is created by a signer's wallet).
      // The connected wallet is the fallback when no key could be resolved.
      const creators = [
        ...new Set([
          treasuryId,
          ...(signerAccounts.length > 0
            ? signerAccounts
            : connectedAccountId
              ? [connectedAccountId]
              : []),
        ]),
      ]
      const scheduleResults = await Promise.allSettled(
        creators.map((creator) => fetchMirrorSchedulesByAccount(config.network, creator)),
      )
      if (generation.current !== mine) return

      const byScheduleId = new Map<string, MirrorSchedule>()
      for (const result of scheduleResults) {
        if (result.status === 'fulfilled') {
          for (const schedule of result.value) byScheduleId.set(schedule.scheduleId, schedule)
        } else {
          failures.push('schedules')
        }
      }
      const schedules = treasurySchedules([...byScheduleId.values()], treasuryId)

      setState((prev) => ({
        ...prev,
        account: accountValue ?? prev.account,
        transactions: transactionsValue.slice(0, SHOW_N * 2),
        schedules,
        updatedMs: Date.now(),
        loading: false,
        error:
          accountValue === null && failures.length > 0
            ? 'The mirror did not answer. This page shows nothing it cannot read.'
            : failures.includes('schedules')
              ? 'Pending schedules could not be read; the rest is current.'
              : null,
      }))
    }

    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => {
      generation.current += 1
      clearInterval(timer)
    }
  }, [treasuryId, connectedAccountId, tick])

  const refresh = useCallback(() => setTick((value) => value + 1), [])

  return { ...state, refresh }
}

/** The snapshot plus its manual refresh, as the panels receive it. */
export interface TreasurySnapshotView extends TreasurySnapshot {
  refresh: () => void
}
