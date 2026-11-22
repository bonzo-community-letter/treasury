import { useState } from 'react'
import { config } from '../config'
import { hashscanScheduleUrl, hashscanTransactionUrl } from '../lib/hedera'
import {
  buildSchedulePlan,
  buildTransferPlan,
  SCHEDULE_EXPIRY_DEFAULT_MINUTES,
  SCHEDULE_EXPIRY_OPTIONS,
  thresholdHelper,
} from '../lib/treasury'
import {
  createScheduledTransfer,
  executeTransfer,
  type ScheduleSubmitOutcome,
  type SubmitOutcome,
} from '../lib/transfer'
import type { TreasuryKeyStructure } from '../lib/accountKey'
import { structureHasRaw } from '../lib/accountKey'
import { ErrorNote, FieldLabel, inputClass, Note, Panel, primaryAction } from './ui'

interface Props {
  treasuryId: string
  structure: TreasuryKeyStructure
  connectedAccountId: string
  connectedKeyRaw: string | null
}

type Phase = 'form' | 'submitting' | 'receipt' | 'done'

/**
 * Layer 3b — move HBAR out of the treasury. The branch is decided by what
 * the chain says the treasury's key is, not by a toggle:
 *
 *   threshold 1   a normal CryptoTransfer, paid and signed by this wallet
 *                 in one step — its key satisfies the 1-of-N;
 *   threshold m>1 a ScheduleCreate wrapping the same transfer. The inner
 *                 transfer carries no transaction id: the network assigns
 *                 one at execution and the inner fee payer defaults to the
 *                 creator, which keeps the ScheduleCreate signable by this
 *                 one wallet. The other signatures arrive as ScheduleSign
 *                 transactions from the other signers — see the pending
 *                 panel. Functionally the LimeChain hedera-multisig pattern.
 *
 * The preflight here is a courtesy (UI gating is cosmetic): the chain is the
 * one that decides whose key counts.
 */
export function TransferPanel({ treasuryId, structure, connectedAccountId, connectedKeyRaw }: Props) {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [expiryMinutes, setExpiryMinutes] = useState(String(SCHEDULE_EXPIRY_DEFAULT_MINUTES))
  const [errors, setErrors] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('form')
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null)
  const [scheduleId, setScheduleId] = useState<string | null>(null)

  const scheduled = structure.threshold > 1
  const holdsKey = structureHasRaw(structure, connectedKeyRaw)
  // A session on the treasury account itself (its key acting through its own
  // threshold) is also allowed to ask; for threshold > 1 it will simply find
  // the chain requires the other signatures too.
  const isTreasurySession = connectedAccountId === treasuryId
  const preflightOk = holdsKey || isTreasurySession

  const submit = async (): Promise<void> => {
    setErrors([])
    setOutcome(null)
    setScheduleId(null)

    if (scheduled) {
      const built = buildSchedulePlan(config.network, treasuryId, recipient, amount, memo, Number(expiryMinutes))
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
        setOutcome({ kind: 'failed', transactionId: '', status: error instanceof Error ? error.message : 'The request failed.' })
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
        setOutcome({ kind: 'failed', transactionId: '', status: error instanceof Error ? error.message : 'The request failed.' })
      }
    }
    setPhase('done')
  }

  return (
    <Panel
      step={scheduled ? `Signer · ${thresholdHelper(structure.threshold, structure.keys.length)}` : 'Signer · 1 of N'}
      title={scheduled ? 'Propose a scheduled transfer' : 'Send from the treasury'}
      note={
        scheduled
          ? `This wraps the transfer in a schedule and waits for ${structure.threshold} of ${structure.keys.length} signatures before the network runs it. You pay only the schedule fee now.`
          : 'A single signature moves this treasury. Your wallet pays the fee and its key satisfies the treasury key.'
      }
    >
      {!preflightOk ? (
        <div className="space-y-4">
          <ErrorNote>
            This wallet's key is not in the treasury's key list — the network will not count its
            signature. The form stays open in case the chain has changed since this page read it.
          </ErrorNote>
        </div>
      ) : null}

      {phase === 'done' && outcome ? (
        <div className="space-y-3">
          <OutcomeLine outcome={outcome} scheduled={scheduled} scheduleId={scheduleId} />
          <button type="button" className={primaryAction} onClick={() => { setPhase('form'); setOutcome(null) }}>
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
              <input className={inputClass} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
            </label>
          </div>

          <label className="block">
            <FieldLabel>{scheduled ? 'Schedule memo (a default names the recipient)' : 'Memo (optional)'}</FieldLabel>
            <input className={inputClass} value={memo} onChange={(event) => setMemo(event.target.value)} />
          </label>

          {scheduled ? (
            <label className="block">
              <FieldLabel>Wait for signatures</FieldLabel>
              <select
                className={inputClass}
                value={expiryMinutes}
                onChange={(event) => setExpiryMinutes(event.target.value)}
              >
                {SCHEDULE_EXPIRY_OPTIONS.map((option) => (
                  <option key={option.minutes} value={String(option.minutes)}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                The network expires the schedule if the {structure.threshold} of{' '}
                {structure.keys.length} signatures do not arrive in time — nothing moves.
              </p>
            </label>
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
              className={primaryAction}
              disabled={phase !== 'form'}
              onClick={() => void submit()}
            >
              {phase === 'submitting'
                ? 'Awaiting your wallet…'
                : phase === 'receipt'
                  ? 'Reading the receipt…'
                  : scheduled
                    ? 'Create the schedule'
                    : 'Send the transfer'}
            </button>
            <span className="text-xs text-ink-faint">Paying wallet: <span className="font-mono">{connectedAccountId}</span></span>
          </div>

          {scheduled ? (
            <Note>
              After this, the other signers connect and press “Sign this schedule” under Pending —
              the network executes once the threshold signs, or lets it expire.
            </Note>
          ) : null}
        </div>
      )}
    </Panel>
  )
}

function OutcomeLine({ outcome, scheduled, scheduleId }: { outcome: SubmitOutcome; scheduled: boolean; scheduleId: string | null }) {
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
        Your wallet answered; the mirror has not indexed it yet. Check the explorer before
        assuming anything moved.{' '}
        <a href={hashscanTransactionUrl(config.network, outcome.transactionId)} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-4 hover:decoration-accent">
          HashScan
        </a>
      </Note>
    )
  }
  if (scheduled && scheduleId) {
    return (
      <p className="text-sm text-ink-soft">
        Schedule <span className="font-mono text-ink">{scheduleId}</span> created ({outcome.status}).{' '}
        <a href={hashscanScheduleUrl(config.network, scheduleId)} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-4 hover:decoration-accent">
          HashScan
        </a>
      </p>
    )
  }
  return (
    <p className="text-sm text-ink-soft">
      {outcome.status}.{outcome.entityId ? ` Entity ${outcome.entityId}.` : ''}{' '}
      <a href={hashscanTransactionUrl(config.network, outcome.transactionId)} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-4 hover:decoration-accent">
        HashScan
      </a>
    </p>
  )
}
