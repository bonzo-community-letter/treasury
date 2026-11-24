import { useState } from 'react'
import { config } from '../config'
import { hashscanTopicUrl, hashscanTransactionUrl } from '../lib/hedera'
import type { TreasuryKeyStructure } from '../lib/accountKey'
import { fingerprint } from '../lib/keys'
import { buildTopicCreatePlan, topicMemoBytes, TOPIC_MEMO_MAX_BYTES } from '../lib/topic'
import { createTopic, type TopicSubmitOutcome } from '../lib/topicSubmit'
import { DEFAULT_MAX_FEE_HBAR } from '../lib/treasury'
import { ErrorNote, FieldLabel, inputClass, Note, Panel, primaryAction, Spinner } from './ui'

interface Props {
  structure: TreasuryKeyStructure
  connectedAccountId: string
  /** raw key → the account that holds it, when the mirror knows one */
  accountIds: ReadonlyMap<string, string>
}

type Phase = 'form' | 'submitting' | 'receipt' | 'done'

/**
 * A topic the treasury owns.
 *
 * The key list of the treasury becomes the topic's admin key, so the topic can
 * be updated or deleted later by the same threshold that governs the treasury —
 * not by whoever happened to pay for it. The paying wallet is the connected
 * one, and the only thing it spends is the creation fee, capped in the form.
 */
export function TopicPanel({ structure, connectedAccountId, accountIds }: Props) {
  const [memo, setMemo] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('form')
  const [outcome, setOutcome] = useState<TopicSubmitOutcome | null>(null)

  const memoBytes = topicMemoBytes(memo.trim())

  const submit = async (): Promise<void> => {
    setErrors([])
    setOutcome(null)
    const built = buildTopicCreatePlan({
      network: config.network,
      structure,
      memo,
      maxFeeHbar: DEFAULT_MAX_FEE_HBAR,
    })
    if (!built.ok) {
      setErrors(built.errors)
      return
    }
    setPhase('submitting')
    try {
      const result = await createTopic(built.plan, {
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
    setPhase('done')
  }

  return (
    <Panel
      step="Create HCS topic"
      title="Create a topic that the treasury controls"
      note={`The treasury's key becomes the topic's admin key — ${structure.threshold} of ${structure.keys.length} signers can update or delete it later. Your wallet pays the creation fee, capped at ${DEFAULT_MAX_FEE_HBAR} HBAR.`}
    >
      {phase === 'done' && outcome ? (
        <div className="space-y-4">
          <TopicReceipt outcome={outcome} />
          <button
            type="button"
            className={primaryAction}
            onClick={() => {
              setPhase('form')
              setOutcome(null)
            }}
          >
            Create another topic
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-[0.5625rem] uppercase tracking-[0.16em] text-ink-faint">Admin key</p>
            <p className="mt-1 font-mono text-xs break-all text-ink-soft">
              {structure.threshold} of {structure.keys.length} ·{' '}
              {structure.keys
                .map((key) => accountIds.get(key.raw) ?? fingerprint(key.der))
                .join(' · ')}
            </p>
          </div>

          <label className="block">
            <FieldLabel>Topic memo (optional)</FieldLabel>
            <input
              className={inputClass}
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="What this topic is for"
            />
            <p className={`mt-2 text-xs leading-relaxed ${memoBytes > TOPIC_MEMO_MAX_BYTES ? 'text-accent' : 'text-ink-faint'}`}>
              {memoBytes} of {TOPIC_MEMO_MAX_BYTES} bytes. A topic memo is public and permanent.
            </p>
          </label>

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
                  : 'Create the topic'}
            </button>
            <span className="text-xs text-ink-faint">
              Fee payer: <span className="font-mono">{connectedAccountId}</span> · fee capped at{' '}
              {DEFAULT_MAX_FEE_HBAR} HBAR
            </span>
          </div>

          <Note>
            The topic is created by this wallet but owned by the treasury: the treasury's key is
            the admin key, so this wallet cannot change or delete it afterwards.
          </Note>
        </div>
      )}
    </Panel>
  )
}

function TopicReceipt({ outcome }: { outcome: TopicSubmitOutcome }) {
  const succeeded = outcome.kind === 'succeeded'
  const failed = outcome.kind === 'failed'

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
            className={`inline-block border px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.14em] ${
              succeeded ? 'border-accent text-accent' : failed ? 'border-accent bg-accent text-page' : 'border-rule text-ink-soft'
            }`}
          >
            {succeeded ? 'Confirmed' : failed ? 'Failed' : 'Unconfirmed'}
          </span>
          <h3 className="mt-2 font-serif text-xl leading-tight text-ink">
            {succeeded ? 'Topic created' : failed ? 'The network refused it' : 'Not confirmed yet'}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            {succeeded
              ? 'The treasury holds the admin key for this topic.'
              : failed
                ? `The network answered ${outcome.status}. Nothing was created.`
                : 'The wallet answered, but the mirror has not indexed the transaction yet. Check the explorer before assuming anything.'}
          </p>
        </div>
      </div>

      <dl className="grid gap-x-8 gap-y-2 border-t border-rule/60 px-4 py-4 text-xs sm:grid-cols-2 sm:px-5">
        {succeeded ? (
          <div className="flex items-baseline justify-between gap-4 border-b border-rule/40 pb-1.5">
            <dt className="shrink-0 text-[0.5625rem] uppercase tracking-[0.16em] text-ink-faint">Topic</dt>
            <dd className="min-w-0 text-right font-mono text-[0.6875rem] break-all text-ink-soft">
              <a
                href={hashscanTopicUrl(config.network, outcome.topicId)}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-rule underline-offset-2 hover:decoration-accent"
              >
                {outcome.topicId}
              </a>
            </dd>
          </div>
        ) : null}
        {outcome.transactionId ? (
          <div className="flex items-baseline justify-between gap-4 border-b border-rule/40 pb-1.5">
            <dt className="shrink-0 text-[0.5625rem] uppercase tracking-[0.16em] text-ink-faint">Transaction</dt>
            <dd className="min-w-0 text-right font-mono text-[0.6875rem] break-all text-ink-soft">
              <a
                href={hashscanTransactionUrl(config.network, outcome.transactionId)}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-rule underline-offset-2 hover:decoration-accent"
              >
                {outcome.transactionId}
              </a>
            </dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-4 border-b border-rule/40 pb-1.5">
          <dt className="shrink-0 text-[0.5625rem] uppercase tracking-[0.16em] text-ink-faint">Status</dt>
          <dd className="min-w-0 text-right font-mono text-[0.6875rem] text-ink-soft">
            {outcome.kind === 'unverified' ? 'not indexed yet' : outcome.status}
          </dd>
        </div>
      </dl>
    </section>
  )
}
