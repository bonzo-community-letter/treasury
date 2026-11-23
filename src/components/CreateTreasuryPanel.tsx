import { useState } from 'react'
import { config } from '../config'
import { hashscanAccountUrl } from '../lib/hedera'
import { addSigner, fingerprint, parseSignerKey, removeSigner, type SignerKey } from '../lib/keys'
import { buildAccountCreatePlan, thresholdHelper } from '../lib/treasury'
import { createTreasuryAccount, type CreateOutcome } from '../lib/create'
import { CopyButton, ErrorNote, FieldLabel, monoInputClass, Panel, primaryAction, inputClass } from './ui'

type Phase = 'form' | 'submitting' | 'receipt' | 'done'

/**
 * Layer 3a — create the treasury account. Admin-gated in the UI, and gated
 * where it counts: only the connected wallet can pay for the CryptoCreate,
 * so whoever this actually creates a treasury with is the wallet behind the
 * admin account id.
 *
 * The key built is always a threshold key — even at 1 of N — so the
 * treasury's shape on chain never depends on how many keys it started with.
 */
export function CreateTreasuryPanel({ onCreated }: { onCreated: (accountId: string) => void }) {
  const [signers, setSigners] = useState<SignerKey[]>([])
  const [keyInput, setKeyInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [threshold, setThreshold] = useState('2')
  const [balance, setBalance] = useState('0')
  const [memo, setMemo] = useState('Open Letter Treasury')
  const [formError, setFormError] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('form')
  const [outcome, setOutcome] = useState<CreateOutcome | null>(null)

  const add = (): void => {
    setFormError(null)
    const parsed = parseSignerKey(keyInput)
    if (!parsed.ok) {
      setFormError(parsed.error)
      return
    }
    const result = addSigner(signers, parsed.key, labelInput)
    if (!result.ok) {
      setFormError(result.error ?? null)
      return
    }
    setSigners(result.list)
    setKeyInput('')
    setLabelInput('')
  }

  const submit = async (): Promise<void> => {
    setErrors([])
    const built = buildAccountCreatePlan(signers, Number(threshold), memo, balance, '2', config.network)
    if (!built.ok) {
      setErrors(built.errors)
      return
    }
    setPhase('submitting')
    try {
      const result = await createTreasuryAccount(built.plan, {
        submitting: () => setPhase('submitting'),
        awaitingReceipt: () => setPhase('receipt'),
      })
      setOutcome(result)
      setPhase('done')
      if (result.kind === 'created') onCreated(result.account.accountId)
    } catch (error) {
      setOutcome({ kind: 'failed', transactionId: '', status: error instanceof Error ? error.message : 'The request failed.' })
      setPhase('done')
    }
  }

  if (phase === 'done' && outcome) {
    return (
      <Panel step="Treasury created" title={outcome.kind === 'created' ? 'Treasury created' : 'Not created'}>
        {outcome.kind === 'created' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-2xl text-ink sm:text-3xl">{outcome.account.accountId}</p>
              <CopyButton text={outcome.account.accountId} label="Copy id" />
            </div>
            <p className="text-sm text-ink-soft">
              Receipt: {outcome.account.status} ·{' '}
              <a
                href={hashscanAccountUrl(config.network, outcome.account.accountId)}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-rule underline-offset-4 hover:decoration-accent"
              >
                HashScan
              </a>
            </p>
            <div>
              <p className="mb-2 text-sm text-ink-soft">
                Add the id to the repository variable{' '}
                <code className="font-mono">VITE_TREASURY_ACCOUNTS</code> and deploy again:
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <code className="break-all border border-rule bg-page px-3 py-2 font-mono text-xs text-ink-soft">
                  VITE_TREASURY_ACCOUNTS={outcome.account.accountId}
                </code>
                <CopyButton text={`VITE_TREASURY_ACCOUNTS=${outcome.account.accountId}`} label="Copy line" />
              </div>
            </div>
            <p className="text-xs leading-relaxed text-ink-faint">
              Signers import the account in HashPack: I already have a wallet → import recovery
              phrase → account ID {outcome.account.accountId}. Transactions need the threshold to
              sign.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <ErrorNote>
              {outcome.kind === 'failed'
                ? outcome.transactionId
                  ? `The network refused the create: ${outcome.status}.`
                  : outcome.status
                : 'The wallet answered; the mirror has not indexed the transaction yet. Check the explorer.'}
            </ErrorNote>
            {outcome.kind === 'unverified' && outcome.accountId ? (
              <p className="text-sm text-ink-soft">
                The wallet reported account <span className="font-mono">{outcome.accountId}</span>.
                Verify it on HashScan before adding it to the configuration.
              </p>
            ) : null}
            <button type="button" onClick={() => setPhase('form')} className={primaryAction}>
              Back to the form
            </button>
          </div>
        )}
      </Panel>
    )
  }

  return (
    <Panel
      step="Admin · new treasury"
      title="Create a treasury account"
      note="A new Hedera account whose key is the threshold over the signer keys below. The connected wallet pays the fee and the initial balance."
    >
      <div className="space-y-5">
        <div>
          <FieldLabel>Signer keys ({signers.length}/10)</FieldLabel>
          <ul className="mb-3 space-y-2">
            {signers.map((signer) => (
              <li key={signer.id} className="flex items-baseline justify-between gap-3 border border-rule bg-page px-3 py-2">
                <span className="min-w-0 font-mono text-xs text-ink-soft">
                  <span className="text-ink">{signer.label || 'unnamed'}</span>{' '}
                  {fingerprint(signer.der)} · {signer.curve}
                </span>
                <button
                  type="button"
                  onClick={() => setSigners(removeSigner(signers, signer.id))}
                  className="shrink-0 text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint hover:text-ink"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
            <input
              className={inputClass}
              value={labelInput}
              onChange={(event) => setLabelInput(event.target.value)}
              placeholder="Name (optional)"
            />
            <input
              className={monoInputClass}
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              placeholder="Public key: 302a… DER or raw hex"
            />
            <button type="button" className={primaryAction} onClick={add}>
              Add
            </button>
          </div>
          {formError ? <p className="mt-2"><ErrorNote>{formError}</ErrorNote></p> : null}
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <label className="block">
            <FieldLabel>Threshold m (of {signers.length})</FieldLabel>
            <input
              className={inputClass}
              inputMode="numeric"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
            />
            <p className="mt-2 text-xs leading-relaxed text-ink-faint">
              {thresholdHelper(Number(threshold), signers.length)}
            </p>
          </label>
          <label className="block">
            <FieldLabel>Initial balance, HBAR</FieldLabel>
            <input className={inputClass} value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="0" />
          </label>
          <label className="block">
            <FieldLabel>Memo (≤ 100 chars)</FieldLabel>
            <input className={inputClass} value={memo} onChange={(event) => setMemo(event.target.value)} />
          </label>
        </div>

        {errors.length > 0 ? (
          <ul className="space-y-1">
            {errors.map((error) => (
              <li key={error}>
                <ErrorNote>{error}</ErrorNote>
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          className={primaryAction}
          disabled={phase !== 'form' || signers.length === 0}
          onClick={() => void submit()}
        >
          {phase === 'submitting'
            ? 'Awaiting your wallet…'
            : phase === 'receipt'
              ? 'Reading the receipt…'
              : 'Create the treasury'}
        </button>
      </div>
    </Panel>
  )
}
