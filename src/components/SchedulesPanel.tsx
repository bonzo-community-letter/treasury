import { useState } from 'react'
import { config } from '../config'
import { hashscanScheduleUrl, hashscanTimestampUrl } from '../lib/hedera'
import { fingerprint } from '../lib/keys'
import { formatHbar } from '../lib/treasury'
import { countdown } from '../lib/time'
import {
  hasKeySigned,
  scheduleView,
  SCHEDULE_STATUS_LABEL,
  type PendingScheduleView,
  type ScheduleStatus,
} from '../lib/schedule'
import type { TreasuryKeyStructure } from '../lib/accountKey'
import type { MirrorSchedule } from '../lib/mirror'
import { signSchedule } from '../lib/transfer'
import type { Role } from '../lib/roles'
import { ErrorNote } from './ui'

interface Props {
  treasuryId: string
  schedules: MirrorSchedule[]
  structure: TreasuryKeyStructure | null
  role: Role
  /** the connected wallet's raw key, when it is readable and single */
  connectedKeyRaw: string | null
  nowSec: number
  /** creators actually searched — shown so the visitor knows the scope */
  searchedCreators: string[]
  onSigned: () => void
}

const STATUS_CLASS: Record<ScheduleStatus, string> = {
  pending: 'text-accent',
  executed: 'text-ink-soft',
  expired: 'text-ink-faint',
  cancelled: 'text-ink-faint',
}

/**
 * The pending scheduled transfers, exactly as the mirror reports them:
 * signatures collected, expiry, execution, deletion. Per-signer checkmarks
 * match the schedule's `public_key_prefix` values (base64 of the raw public
 * key) against the treasury's keys — the same comparison the network makes,
 * run against the network's own answer. Status comes from the mirror on
 * every read, never from what this page assumed at create time.
 */
export function SchedulesPanel({
  treasuryId,
  schedules,
  structure,
  role,
  connectedKeyRaw,
  nowSec,
  searchedCreators,
  onSigned,
}: Props) {
  if (!structure) {
    return (
      <section className="border border-rule bg-hero px-5 py-6 sm:px-8 sm:py-8">
        <p className="eyebrow">Scheduled transfers</p>
        <p className="mt-4 text-sm text-ink-soft">Reading the treasury key…</p>
      </section>
    )
  }

  const views = schedules
    .map((schedule) => scheduleView(schedule, treasuryId, structure, nowSec))
    .filter((view): view is PendingScheduleView => view !== null)
    .sort((a, b) => (b.schedule.executedTimestamp === null ? 1 : 0) - (a.schedule.executedTimestamp === null ? 1 : 0))

  const pending = views.filter((view) => view.status === 'pending')
  const resolved = views.filter((view) => view.status !== 'pending')

  return (
    <section className="border border-rule bg-hero px-5 py-6 sm:px-8 sm:py-8">
      <p className="eyebrow">Scheduled transfers</p>
      <h2 className="mt-2 font-serif text-2xl leading-tight text-ink">
        {pending.length === 0 ? 'Nothing awaiting signatures' : `${pending.length} awaiting signatures`}
      </h2>

      {pending.length === 0 && resolved.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Scheduled transfers stay here until their threshold signs.
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        {pending.map((view) => (
          <PendingCard
            key={view.schedule.scheduleId}
            view={view}
            role={role}
            connectedKeyRaw={connectedKeyRaw}
            nowSec={nowSec}
            onSigned={onSigned}
          />
        ))}
        {resolved.map((view) => (
          <ResolvedRow key={view.schedule.scheduleId} view={view} />
        ))}
      </div>

      {views.length > 0 ? (
        <p className="mt-5 text-xs leading-relaxed text-ink-faint">
          Schedules are indexed by creator. Searched:{' '}
          {searchedCreators.length > 1 ? searchedCreators.join(', ') : searchedCreators[0]}.
        </p>
      ) : null}
    </section>
  )
}

function PendingCard({
  view,
  role,
  connectedKeyRaw,
  nowSec,
  onSigned,
}: {
  view: PendingScheduleView
  role: Role
  connectedKeyRaw: string | null
  nowSec: number
  onSigned: () => void
}) {
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'receipt'>('idle')
  const [outcome, setOutcome] = useState<string | null>(null)
  const canSign = role === 'admin' || role === 'signer'
  const alreadySigned = hasKeySigned(view, connectedKeyRaw)
  const mine = view.signers.find((signer) => signer.key.raw === connectedKeyRaw?.toLowerCase())

  const sign = async (): Promise<void> => {
    setOutcome(null)
    try {
      const result = await signSchedule(view.schedule.scheduleId, {
        submitting: () => setPhase('submitting'),
        awaitingReceipt: () => setPhase('receipt'),
      })
      if (result.kind === 'succeeded') {
        setOutcome('Signed. The mirror will show the next count in a moment.')
        onSigned()
      } else if (result.kind === 'failed') {
        setOutcome(`The network refused: ${result.status}.`)
      } else {
        setOutcome('Your wallet answered; the mirror has not indexed it yet. Check the link.')
      }
    } catch (error) {
      setOutcome(error instanceof Error ? error.message : 'The signing request failed.')
    } finally {
      setPhase('idle')
    }
  }

  return (
    <div className="border border-rule bg-page px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="font-mono text-sm text-ink">{view.schedule.scheduleId}</p>
        <p className="tnum text-sm text-ink-soft">
          {formatHbar(view.transfer.amountOutTinybars)} →{' '}
          <span className="font-mono text-xs">{view.transfer.recipient}</span>
        </p>
      </div>

      {view.schedule.memo.length > 0 ? (
        <p className="mt-2 text-xs italic text-ink-faint">“{view.schedule.memo}”</p>
      ) : null}

      <p className="mt-3 text-sm text-ink-soft">
        <span className={`tnum ${view.collected >= view.threshold ? 'text-accent' : ''}`}>
          {view.collected} of {view.threshold}
        </span>{' '}
        signatures collected · {SCHEDULE_STATUS_LABEL[view.status]} · expires {countdown(view.expirySec, nowSec)}
      </p>

      <ul className="mt-3 flex flex-wrap gap-2">
        {view.signers.map((signer) => (
          <li
            key={signer.key.raw}
            className={`border px-2 py-1 font-mono text-[0.6875rem] ${
              signer.signed ? 'border-accent/60 text-ink' : 'border-rule text-ink-faint'
            }`}
          >
            {signer.signed ? '✓ ' : '· '}
            {signer.key.curve} {fingerprint(signer.key.der)}
            {mine && mine.key.raw === signer.key.raw ? ' (you)' : ''}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {canSign ? (
          <button
            type="button"
            disabled={phase !== 'idle' || alreadySigned}
            onClick={() => void sign()}
            className="rounded-sm bg-accent px-4 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-page transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {alreadySigned
              ? 'Already signed'
              : phase === 'submitting'
                ? 'Awaiting your wallet…'
                : phase === 'receipt'
                  ? 'Reading the receipt…'
                  : 'Sign this schedule'}
          </button>
        ) : null}
        <a
          href={hashscanScheduleUrl(config.network, view.schedule.scheduleId)}
          target="_blank"
          rel="noreferrer"
          className="text-xs underline decoration-rule underline-offset-4 transition-colors hover:decoration-accent"
        >
          HashScan
        </a>
      </div>

      {outcome ? (
        <p className="mt-3">
          <ErrorNote>{outcome}</ErrorNote>
        </p>
      ) : null}
    </div>
  )
}

function ResolvedRow({ view }: { view: PendingScheduleView }) {
  const { schedule, status, transfer } = view
  const plain =
    status === 'executed' ? (
      <>
        Executed — {formatHbar(transfer.amountOutTinybars)} to{' '}
        <a
          href={
            view.executedTimestamp
              ? hashscanTimestampUrl(config.network, view.executedTimestamp)
              : hashscanScheduleUrl(config.network, schedule.scheduleId)
          }
          target="_blank"
          rel="noreferrer"
          className="underline decoration-rule underline-offset-4 transition-colors hover:decoration-accent"
        >
          the transaction
        </a>
        .
      </>
    ) : status === 'expired' ? (
      <>Expired unsigned after {view.collected} of {view.threshold} signatures — nothing moved.</>
    ) : (
      <>Cancelled. {schedule.memo ? `Memo: ${schedule.memo}.` : ''}</>
    )

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border border-rule/60 px-4 py-3">
      <p className="font-mono text-xs text-ink-faint">{schedule.scheduleId}</p>
      <p className={`text-sm ${STATUS_CLASS[status]}`}>{plain}</p>
    </div>
  )
}
