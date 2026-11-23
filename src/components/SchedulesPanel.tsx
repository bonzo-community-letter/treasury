import { useState } from 'react'
import { config } from '../config'
import { hashscanScheduleUrl } from '../lib/hedera'
import { fingerprint } from '../lib/keys'
import { formatHbar } from '../lib/treasury'
import { countdown, secondsOfTimestamp, shortDateTime } from '../lib/time'
import { hasKeySigned, scheduleView, type PendingScheduleView } from '../lib/schedule'
import type { TreasuryKeyStructure } from '../lib/accountKey'
import type { MirrorSchedule } from '../lib/mirror'
import { signSchedule } from '../lib/transfer'
import type { Role } from '../lib/roles'
import { StatusBadge, type StatusTone } from './ui'

interface Props {
  treasuryId: string
  schedules: MirrorSchedule[]
  structure: TreasuryKeyStructure | null
  role: Role
  /** the connected wallet's raw key, when it is readable and single */
  connectedKeyRaw: string | null
  nowSec: number
  /** raw key → the account that holds it, when the mirror knows one */
  accountIds: ReadonlyMap<string, string>
  onSigned: () => void
}

interface Badge {
  label: string
  tone: StatusTone
  detail?: string
}

/**
 * One schedule's status, in the same pill the transactions table uses.
 * WAITING means the network still lacks signatures; a schedule that will
 * never run (expired, cancelled) reads as Error, with the network's reason on
 * the tooltip.
 */
function badgeOf(view: PendingScheduleView, nowSec: number): Badge {
  if (view.status === 'pending') {
    return {
      label: 'Waiting',
      tone: 'waiting',
      detail: `${view.collected} of ${view.threshold} signatures · expires ${countdown(view.expirySec, nowSec)}`,
    }
  }
  if (view.status === 'executed') return { label: 'Executed', tone: 'ok' }
  if (view.status === 'expired') {
    return {
      label: 'Error',
      tone: 'error',
      detail: `Expired unsigned after ${view.collected} of ${view.threshold} signatures. Nothing moved.`,
    }
  }
  return {
    label: 'Error',
    tone: 'error',
    detail: view.schedule.memo ? `Cancelled. Memo: ${view.schedule.memo}` : 'Cancelled.',
  }
}

/**
 * The scheduled transfers, read from the mirror and laid out as the same
 * table as the recent transactions: time, recipient, amount, signatures,
 * status, action. Status is the network's answer, never what this page
 * assumed at create time; a waiting row carries its Sign button.
 */
export function SchedulesPanel({
  treasuryId,
  schedules,
  structure,
  role,
  connectedKeyRaw,
  nowSec,
  accountIds,
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
  const ordered = [...pending, ...resolved]

  return (
    <section className="border border-rule bg-hero px-5 py-6 sm:px-8 sm:py-8">
      <p className="eyebrow">Scheduled transfers</p>
      <h2 className="mt-2 font-serif text-2xl leading-tight text-ink">
        {pending.length === 0 ? 'Nothing awaiting signatures' : `${pending.length} awaiting signatures`}
      </h2>

      {views.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Scheduled transfers stay here until their threshold signs.
        </p>
      ) : (
        <>
          <div className="mt-4 hidden overflow-x-auto sm:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-rule text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
                  <th className="py-2 pr-4 font-semibold">Time</th>
                  <th className="py-2 pr-4 font-semibold">Recipient</th>
                  <th className="py-2 pr-4 text-right font-semibold">Amount</th>
                  <th className="py-2 pr-4 font-semibold">Signatures</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((view) => (
                  <ScheduleRow
                    key={view.schedule.scheduleId}
                    view={view}
                    role={role}
                    connectedKeyRaw={connectedKeyRaw}
                    nowSec={nowSec}
                    accountIds={accountIds}
                    onSigned={onSigned}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-4 space-y-4 sm:hidden">
            {ordered.map((view) => (
              <MobileSchedule
                key={`${view.schedule.scheduleId}-m`}
                view={view}
                role={role}
                connectedKeyRaw={connectedKeyRaw}
                nowSec={nowSec}
                onSigned={onSigned}
              />
            ))}
          </ul>

          <p className="mt-5 text-xs leading-relaxed text-ink-faint">
            Schedules are indexed by creator; this list covers the treasury and the accounts holding
            its keys.
          </p>
        </>
      )}
    </section>
  )
}

/** The per-signer list, as the signatures cell's tooltip — accounts when known. */
function signerDetail(view: PendingScheduleView, accountIds: ReadonlyMap<string, string>): string {
  return view.signers
    .map(
      (signer) =>
        `${signer.signed ? '✓' : '·'} ${accountIds.get(signer.key.raw) ?? `${signer.key.curve} ${fingerprint(signer.key.der)}`}`,
    )
    .join('\n')
}

function ScheduleRow({
  view,
  role,
  connectedKeyRaw,
  nowSec,
  accountIds,
  onSigned,
}: {
  view: PendingScheduleView
  role: Role
  connectedKeyRaw: string | null
  nowSec: number
  accountIds: ReadonlyMap<string, string>
  onSigned: () => void
}) {
  const { phase, message, sign } = useSign(view, role, connectedKeyRaw, onSigned)
  const badge = badgeOf(view, nowSec)
  const createdSec = secondsOfTimestamp(view.schedule.createdTimestamp ?? null)

  return (
    <tr className="border-b border-rule/60 align-baseline last:border-b-0">
      <td className="tnum py-2.5 pr-4 whitespace-nowrap text-ink-soft">
        {shortDateTime(createdSec)}
        <a
          href={hashscanScheduleUrl(config.network, view.schedule.scheduleId)}
          target="_blank"
          rel="noreferrer"
          title={view.schedule.memo || undefined}
          className="block font-mono text-[0.625rem] tracking-normal text-ink-faint underline decoration-rule underline-offset-2 hover:text-ink-soft hover:decoration-accent"
        >
          {view.schedule.scheduleId}
        </a>
      </td>
      <td className="py-2.5 pr-4 font-mono text-xs break-all text-ink-soft">{view.transfer.recipient}</td>
      <td className="tnum py-2.5 pr-4 text-right whitespace-nowrap text-ink">
        {formatHbar(view.transfer.amountOutTinybars)}
      </td>
      <td className="tnum py-2.5 pr-4 whitespace-nowrap text-ink-soft" title={signerDetail(view, accountIds)}>
        {view.collected} of {view.threshold}
      </td>
      <td className="py-2.5 pr-4">
        <StatusBadge label={badge.label} tone={badge.tone} detail={badge.detail} />
      </td>
      <td className="py-2.5">
        {phase === 'hidden' ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <SignButton phase={phase} label={view.schedule.scheduleId} onSign={sign} />
        )}
        {message ? (
          <p className="mt-1 max-w-[16rem] text-[0.625rem] leading-snug text-ink-faint">{message}</p>
        ) : null}
      </td>
    </tr>
  )
}

function MobileSchedule({
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
  const { phase, message, sign } = useSign(view, role, connectedKeyRaw, onSigned)
  const badge = badgeOf(view, nowSec)
  const createdSec = secondsOfTimestamp(view.schedule.createdTimestamp ?? null)

  return (
    <li className="border-b border-rule/60 pb-3 last:border-b-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="tnum text-xs text-ink-soft">{shortDateTime(createdSec)}</span>
        <span className="tnum text-sm text-ink">{formatHbar(view.transfer.amountOutTinybars)}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <StatusBadge label={badge.label} tone={badge.tone} detail={badge.detail} />
        <span className="tnum text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
          {view.collected} of {view.threshold} signatures
        </span>
      </div>
      <p className="mt-1 break-all font-mono text-xs text-ink-soft">{view.transfer.recipient}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {phase !== 'hidden' ? (
          <SignButton phase={phase} label={view.schedule.scheduleId} onSign={sign} />
        ) : null}
        <a
          href={hashscanScheduleUrl(config.network, view.schedule.scheduleId)}
          target="_blank"
          rel="noreferrer"
          className="text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint underline decoration-rule underline-offset-4 hover:text-ink-soft hover:decoration-accent"
        >
          HashScan
        </a>
      </div>
      {message ? <p className="mt-1 text-[0.625rem] leading-snug text-ink-faint">{message}</p> : null}
    </li>
  )
}

type SignPhase = 'hidden' | 'idle' | 'submitting' | 'receipt'

/** The signing state of one row — hidden when this wallet cannot sign it. */
function useSign(
  view: PendingScheduleView,
  role: Role,
  connectedKeyRaw: string | null,
  onSigned: () => void,
) {
  const [phase, setPhase] = useState<SignPhase>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const canSign = role === 'admin' || role === 'signer'
  const alreadySigned = hasKeySigned(view, connectedKeyRaw)
  const hidden = !canSign || view.status !== 'pending' || alreadySigned

  const sign = async (): Promise<void> => {
    setMessage(null)
    try {
      const result = await signSchedule(view.schedule.scheduleId, {
        submitting: () => setPhase('submitting'),
        awaitingReceipt: () => setPhase('receipt'),
      })
      if (result.kind === 'succeeded') {
        setMessage('Signed. The network updates the count shortly.')
        onSigned()
      } else if (result.kind === 'failed') {
        setMessage(`The network refused: ${result.status}.`)
      } else {
        setMessage('The wallet answered; the mirror has not indexed it yet.')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The signing request failed.')
    } finally {
      setPhase('idle')
    }
  }

  return { phase: hidden ? ('hidden' as SignPhase) : phase, message, sign }
}

function SignButton({
  phase,
  label,
  onSign,
}: {
  phase: SignPhase
  label: string
  onSign: () => void
}) {
  const busy = phase === 'submitting' || phase === 'receipt'
  return (
    <button
      type="button"
      aria-label={`Sign schedule ${label}`}
      disabled={busy}
      onClick={onSign}
      className="rounded-sm border border-accent bg-accent px-3 py-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-page transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {phase === 'submitting' ? 'Awaiting wallet…' : phase === 'receipt' ? 'Reading…' : 'Sign'}
    </button>
  )
}
