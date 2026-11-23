import { useState, type ReactNode } from 'react'
import { config } from '../config'
import { hashscanScheduleUrl, hashscanTransactionUrl } from '../lib/hedera'
import {
  buildSchedulePlan,
  buildTransferPlan,
  formatHbar,
  hbarFromTinybarsForInput,
  SCHEDULE_EXPIRY_DEFAULT_MINUTES,
} from '../lib/treasury'
import { formatUsd } from '../lib/price'
import { shortDateTime } from '../lib/time'
import {
  createScheduledTransfer,
  executeTransfer,
  type ScheduleSubmitOutcome,
  type SubmitOutcome,
} from '../lib/transfer'
import type { TreasuryKeyStructure } from '../lib/accountKey'
import { structureHasRaw } from '../lib/accountKey'
import { ErrorNote, FieldLabel, inputClass, Note, Panel, primaryAction, Spinner, Switch } from './ui'

interface Props {
  treasuryId: string
  structure: TreasuryKeyStructure
  connectedAccountId: string
  connectedKeyRaw: string | null
  /** the treasury's balance, for the Max button and the balance line */
  balanceTinybars: bigint | null
  /** HBAR in dollars, for that same line; null while the rate is unknown */
  usdPerHbar: number | null
}

type Phase = 'form' | 'submitting' | 'receipt' | 'done'

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in the browser's own zone. */
function toLocalInputValue(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function defaultExpiryInput(): string {
  return toLocalInputValue(new Date(Date.now() + SCHEDULE_EXPIRY_DEFAULT_MINUTES * 60_000))
}

/**
 * Layer 3b — move HBAR out of the treasury.
 *
 * A transfer at a threshold of 1 is a plain CryptoTransfer: one signature,
 * the wallet pays. Anything above 1 is a schedule, and so is a 1-of-N
 * transfer when the signer asks for one — the same ScheduleCreate either way,
 * with the expiry chosen in the form and an optional "wait for expiry".
 *
 * The scheduled transfer carries no transaction id: the network assigns one
 * at execution and the inner fee payer defaults to the creator, which keeps
 * the ScheduleCreate signable by this one wallet. The other signatures arrive
 * as ScheduleSign transactions from the other signers.
 *
 * The preflight here is a courtesy (UI gating is cosmetic): the chain is the
 * one that decides whose key counts.
 */
export function TransferPanel({
  treasuryId,
  structure,
  connectedAccountId,
  connectedKeyRaw,
  balanceTinybars,
  usdPerHbar,
}: Props) {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [scheduledOn, setScheduledOn] = useState(false)
  const [expiryInput, setExpiryInput] = useState(defaultExpiryInput)
  const [waitForExpiry, setWaitForExpiry] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('form')
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null)
  const [scheduleId, setScheduleId] = useState<string | null>(null)
  /** What was actually sent — the receipt is read off this, not off the form. */
  const [sent, setSent] = useState<{
    recipient: string
    amountTinybars: string
    scheduled: boolean
    expirySec: number | null
    waitForExpiry: boolean
  } | null>(null)

  // Above 1 of N a direct transfer is not possible — the schedule is the only
  // path, so the switch is on and locked.
  const mustSchedule = structure.threshold > 1
  const scheduled = mustSchedule || scheduledOn

  const holdsKey = structureHasRaw(structure, connectedKeyRaw)
  // A session on the treasury account itself (its key acting through its own
  // threshold) is also allowed to ask; for threshold > 1 it will simply find
  // the chain requires the other signatures too.
  const isTreasurySession = connectedAccountId === treasuryId
  const preflightOk = holdsKey || isTreasurySession

  const balanceUsd =
    balanceTinybars !== null && usdPerHbar !== null ? formatUsd(balanceTinybars, usdPerHbar) : null

  const fillMax = (): void => {
    if (balanceTinybars === null) return
    setAmount(hbarFromTinybarsForInput(balanceTinybars))
  }

  const submit = async (): Promise<void> => {
    setErrors([])
    setOutcome(null)
    setScheduleId(null)

    if (scheduled) {
      const expirySec = expiryInput.length > 0 ? Math.floor(new Date(expiryInput).getTime() / 1000) : Number.NaN
      const built = buildSchedulePlan({
        network: config.network,
        treasuryAccountId: treasuryId,
        recipient,
        hbar: amount,
        memo,
        expirySec,
        waitForExpiry,
      })
      if (!built.ok) {
        setErrors(built.errors)
        return
      }
      setSent({
        recipient: built.plan.recipientAccountId,
        amountTinybars: built.plan.amountTinybars,
        scheduled: true,
        expirySec: built.plan.expirySec,
        waitForExpiry: built.plan.waitForExpiry,
      })
      setPhase('submitting')
      try {
        const result: ScheduleSubmitOutcome = await createScheduledTransfer(built.plan, {
          submitting: () => setPhase('submitting'),
          awaitingReceipt: () => setPhase('receipt'),
        })
        setOutcome(result)
        setScheduleId(result.scheduleId)
      } catch (error) {
        setOutcome({
          kind: 'failed',
          transactionId: '',
          status: error instanceof Error ? error.message : 'The request failed.',
        })
      }
    } else {
      const built = buildTransferPlan(config.network, treasuryId, recipient, amount, memo)
      if (!built.ok) {
        setErrors(built.errors)
        return
      }
      setSent({
        recipient: built.plan.recipientAccountId,
        amountTinybars: built.plan.amountTinybars,
        scheduled: false,
        expirySec: null,
        waitForExpiry: false,
      })
      setPhase('submitting')
      try {
        const result = await executeTransfer(built.plan, {
          submitting: () => setPhase('submitting'),
          awaitingReceipt: () => setPhase('receipt'),
        })
        setOutcome(result)
      } catch (error) {
        setOutcome({
          kind: 'failed',
          transactionId: '',
          status: error instanceof Error ? error.message : 'The request failed.',
        })
      }
    }
    setPhase('done')
  }

  return (
    <Panel
      step="New transaction"
      title={scheduled ? 'Create a scheduled transfer' : 'Send from the treasury'}
      note={
        scheduled
          ? `The transfer is created as a schedule. The network executes it after ${structure.threshold} of ${structure.keys.length} signatures. This wallet pays the schedule fee.`
          : 'One signature sends this transfer. This wallet pays the fee.'
      }
    >
      {!preflightOk ? (
        <div className="space-y-4">
          <ErrorNote>
            This wallet's key is not in the treasury's key list. The network will not accept its
            signature.
          </ErrorNote>
        </div>
      ) : null}

      {phase === 'done' && outcome ? (
        <div className="space-y-4">
          <Confirmation outcome={outcome} sent={sent} scheduleId={scheduleId} />
          <button
            type="button"
            className={primaryAction}
            onClick={() => {
              setPhase('form')
              setOutcome(null)
              setSent(null)
            }}
          >
            Another transfer
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>Recipient account</FieldLabel>
              <input
                className={inputClass}
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="0.0.12345"
              />
            </label>
            <label className="block">
              <FieldLabel>Amount, HBAR</FieldLabel>
              <div className="relative">
                <input
                  className={`${inputClass} pr-16`}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                />
                <button
                  type="button"
                  onClick={fillMax}
                  disabled={balanceTinybars === null}
                  title="Fill in the whole balance"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm border border-rule px-2 py-1 text-[0.5625rem] font-semibold uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Max
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                Balance{' '}
                <span className="tnum text-ink-soft">
                  {balanceTinybars === null ? '—' : formatHbar(balanceTinybars)}
                </span>
                {balanceUsd ? <> · {balanceUsd}</> : null}
              </p>
            </label>
          </div>

          <label className="block">
            <FieldLabel>{scheduled ? 'Schedule memo (a default names the recipient)' : 'Memo (optional)'}</FieldLabel>
            <input className={inputClass} value={memo} onChange={(event) => setMemo(event.target.value)} />
          </label>

          <Switch
            checked={scheduled}
            onChange={setScheduledOn}
            disabled={mustSchedule}
            label="Scheduled"
            note={
              mustSchedule
                ? `This treasury needs ${structure.threshold} of ${structure.keys.length} signatures, so every transfer is scheduled.`
                : 'Collects signatures first and lets the network execute it when the threshold is reached.'
            }
          />

          {scheduled ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <FieldLabel>Expires</FieldLabel>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={expiryInput}
                  onChange={(event) => setExpiryInput(event.target.value)}
                />
                <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                  The network drops the schedule if the signatures are not collected by then (62
                  days at most).
                </p>
              </label>
              <div className="sm:pt-6">
                <Switch
                  checked={waitForExpiry}
                  onChange={setWaitForExpiry}
                  label="Wait for expiry"
                  note="Runs at that time even if the threshold signed earlier."
                />
              </div>
            </div>
          ) : null}

          {errors.length > 0 ? (
            <ul className="space-y-1">
              {errors.map((error) => (
                <li key={error}>
                  <ErrorNote>{error}</ErrorNote>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              className={`${primaryAction} inline-flex items-center gap-2`}
              disabled={phase !== 'form'}
              onClick={() => void submit()}
            >
              {phase !== 'form' ? <Spinner /> : null}
              {phase === 'submitting'
                ? 'Awaiting your wallet…'
                : phase === 'receipt'
                  ? 'Reading the receipt…'
                  : scheduled
                    ? 'Create the schedule'
                    : 'Send the transfer'}
            </button>
            <span className="text-xs text-ink-faint">
              Fee payer: <span className="font-mono">{connectedAccountId}</span>
            </span>
          </div>

          {scheduled ? (
            <Note>
              The other signers sign it under Scheduled transfers. The network executes it when the
              threshold is reached, or the schedule expires.
            </Note>
          ) : null}
        </div>
      )}
    </Panel>
  )
}

/**
 * The receipt, as the thing the signer came for: one clear verdict, then the
 * facts it is made of. Nothing here is assumed — the verdict is the network's
 * own status word, read back from the mirror.
 */
function Confirmation({
  outcome,
  sent,
  scheduleId,
}: {
  outcome: SubmitOutcome
  sent: {
    recipient: string
    amountTinybars: string
    scheduled: boolean
    expirySec: number | null
    waitForExpiry: boolean
  } | null
  scheduleId: string | null
}) {
  const succeeded = outcome.kind === 'succeeded'
  const failed = outcome.kind === 'failed'

  const verdict = succeeded
    ? sent?.scheduled
      ? 'Schedule created'
      : 'Transaction confirmed'
    : failed
      ? 'The network refused it'
      : 'Not confirmed yet'

  const badge = succeeded ? 'Confirmed' : failed ? 'Failed' : 'Unconfirmed'
  const badgeTone = succeeded ? 'border-accent text-accent' : failed ? 'border-accent bg-accent text-page' : 'border-rule text-ink-soft'

  return (
    <section
      aria-live="polite"
      className={`border ${succeeded ? 'border-accent/60 bg-accent/[0.05]' : 'border-rule bg-page'}`}
    >
      <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border ${
            succeeded ? 'border-accent text-accent' : failed ? 'border-accent bg-accent text-page' : 'border-rule text-ink-faint'
          }`}
        >
          {succeeded ? (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
              <path d="M2.5 8.5l3.5 3.5 7-8" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          ) : failed ? (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
              <path d="M8 4v4.5M8 11.5v.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          )}
        </span>

        <div className="min-w-0">
          <span
            className={`inline-block border px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.14em] ${badgeTone}`}
          >
            {badge}
          </span>
          <h3 className="mt-2 font-serif text-xl leading-tight text-ink">{verdict}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            {succeeded
              ? sent
                ? `${formatHbar(sent.amountTinybars)} to ${sent.recipient}${sent.scheduled ? ' — the network executes it once the threshold signed' : ''}.`
                : 'The network accepted it.'
              : failed
                ? `The network answered ${outcome.kind === 'failed' ? outcome.status : ''}. Nothing was moved.`
                : 'The wallet answered, but the mirror has not indexed the transaction yet. Check the explorer before assuming anything.'}
          </p>
        </div>
      </div>

      <dl className="grid gap-x-8 gap-y-2 border-t border-rule/60 px-4 py-4 text-xs sm:grid-cols-2 sm:px-5">
        {sent ? <Fact label="Amount">{formatHbar(sent.amountTinybars)}</Fact> : null}
        {sent ? <Fact label="Recipient">{sent.recipient}</Fact> : null}
        {sent?.scheduled && scheduleId ? (
          <Fact label="Schedule">
            <a
              href={hashscanScheduleUrl(config.network, scheduleId)}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-rule underline-offset-2 hover:decoration-accent"
            >
              {scheduleId}
            </a>
          </Fact>
        ) : null}
        {sent?.scheduled && sent.expirySec !== null ? (
          <Fact label={sent.waitForExpiry ? 'Expires (waits for it)' : 'Expires'}>
            {shortDateTime(sent.expirySec)}
          </Fact>
        ) : null}
        {outcome.transactionId ? (
          <Fact label="Transaction">
            <a
              href={hashscanTransactionUrl(config.network, outcome.transactionId)}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-rule underline-offset-2 hover:decoration-accent"
            >
              {outcome.transactionId}
            </a>
          </Fact>
        ) : null}
        <Fact label="Status">{outcome.kind === 'failed' ? outcome.status : succeeded ? outcome.status : 'not indexed yet'}</Fact>
      </dl>
    </section>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule/40 pb-1.5 last:border-b-0">
      <dt className="shrink-0 text-[0.5625rem] uppercase tracking-[0.16em] text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-right font-mono text-[0.6875rem] break-all text-ink-soft">{children}</dd>
    </div>
  )
}
