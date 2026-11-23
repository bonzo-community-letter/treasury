import { useState } from 'react'
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
        <div className="space-y-3">
          <OutcomeLine outcome={outcome} scheduled={scheduled} scheduleId={scheduleId} />
          <button
            type="button"
            className={primaryAction}
            onClick={() => {
              setPhase('form')
              setOutcome(null)
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

function OutcomeLine({
  outcome,
  scheduled,
  scheduleId,
}: {
  outcome: SubmitOutcome
  scheduled: boolean
  scheduleId: string | null
}) {
  if (outcome.kind === 'failed') {
    return (
      <ErrorNote>
        {outcome.transactionId ? `The network refused the transaction: ${outcome.status}.` : outcome.status}
      </ErrorNote>
    )
  }
  if (outcome.kind === 'unverified') {
    return (
      <Note>
        The wallet answered; the mirror has not indexed the transaction yet. Check the explorer.{' '}
        <a
          href={hashscanTransactionUrl(config.network, outcome.transactionId)}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-rule underline-offset-4 hover:decoration-accent"
        >
          HashScan
        </a>
      </Note>
    )
  }
  if (scheduled && scheduleId) {
    return (
      <p className="text-sm text-ink-soft">
        Schedule <span className="font-mono text-ink">{scheduleId}</span> created ({outcome.status}).{' '}
        <a
          href={hashscanScheduleUrl(config.network, scheduleId)}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-rule underline-offset-4 hover:decoration-accent"
        >
          HashScan
        </a>
      </p>
    )
  }
  return (
    <p className="text-sm text-ink-soft">
      {outcome.status}.{outcome.entityId ? ` Entity ${outcome.entityId}.` : ''}{' '}
      <a
        href={hashscanTransactionUrl(config.network, outcome.transactionId)}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-rule underline-offset-4 hover:decoration-accent"
      >
        HashScan
      </a>
    </p>
  )
}
