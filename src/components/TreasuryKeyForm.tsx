import { useEffect, useState } from 'react'
import { config } from '../config'
import { hashscanTransactionUrl } from '../lib/hedera'
import type { TreasuryKeyStructure } from '../lib/accountKey'
import { addSigner, fingerprint, parseSignerKey, removeSigner, type SignerKey } from '../lib/keys'
import { buildAccountUpdatePlan, thresholdHelper } from '../lib/treasury'
import { updateTreasuryKey, type UpdateOutcome } from '../lib/update'
import { ErrorNote, FieldLabel, inputClass, monoInputClass, primaryAction } from './ui'

type Phase = 'form' | 'submitting' | 'receipt' | 'done'

/** The chain's key structure as the editor's list — the starting point of every change. */
export function signersFromStructure(structure: TreasuryKeyStructure): SignerKey[] {
  return structure.keys.map((key) => ({
    id: key.raw,
    label: '',
    der: key.der,
    raw: key.raw,
    curve: key.curve,
  }))
}

/**
 * The key editor: who signs and how many of them must. It is the body of the
 * settings dialog — the dialog brings the frame, this brings the change.
 *
 * The update is authorized by the treasury's CURRENT key, so the connected
 * wallet has to hold one of those keys. At 1-of-n one wallet suffices; at
 * m-of-n the transaction needs m signatures at once, and this says so
 * instead of offering a button that cannot finish.
 */
export function TreasuryKeyForm({
  treasuryId,
  structure,
  connectedKeyRaw,
  onUpdated,
}: {
  treasuryId: string
  structure: TreasuryKeyStructure
  connectedKeyRaw: string | null
  onUpdated: () => void
}) {
  const [signers, setSigners] = useState<SignerKey[]>(() => signersFromStructure(structure))
  const [keyInput, setKeyInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [threshold, setThreshold] = useState(String(structure.threshold))
  const [formError, setFormError] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('form')
  const [outcome, setOutcome] = useState<UpdateOutcome | null>(null)

  // A key change that lands (or any re-read) resets the editor to the chain.
  useEffect(() => {
    setSigners(signersFromStructure(structure))
    setThreshold(String(structure.threshold))
    setPhase('form')
    setOutcome(null)
  }, [structure])

  const currentDers = structure.keys.map((key) => key.der)
  const holdsCurrentKey =
    connectedKeyRaw !== null && structure.keys.some((key) => key.raw === connectedKeyRaw)
  const singleSigner = structure.threshold === 1

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
    const built = buildAccountUpdatePlan({
      network: config.network,
      accountId: treasuryId,
      keys: signers,
      threshold: Number(threshold),
      currentKeyDers: currentDers,
      currentThreshold: structure.threshold,
    })
    if (!built.ok) {
      setErrors(built.errors)
      return
    }
    setPhase('submitting')
    try {
      const result = await updateTreasuryKey(built.plan, {
        submitting: () => setPhase('submitting'),
        awaitingReceipt: () => setPhase('receipt'),
      })
      setOutcome(result)
      setPhase('done')
      if (result.kind === 'updated') onUpdated()
    } catch (error) {
      setOutcome({
        kind: 'unverified',
        transactionId: error instanceof Error ? error.message : 'The request failed.',
      })
      setPhase('done')
    }
  }

  if (phase === 'done' && outcome) {
    return outcome.kind === 'updated' ? (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-ink-soft">
          Receipt: {outcome.status}. The key is updated.
        </p>
        <a
          href={hashscanTransactionUrl(config.network, outcome.transactionId)}
          target="_blank"
          rel="noreferrer"
          className="block break-all font-mono text-[0.75rem] text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink"
        >
          {outcome.transactionId} ↗
        </a>
        <p className="text-xs leading-relaxed text-ink-faint">
          Signers import the account in HashPack: I already have a wallet → import recovery phrase
          → account ID {treasuryId}.
        </p>
      </div>
    ) : (
      <div className="space-y-3">
        <ErrorNote>
          {outcome.kind === 'failed'
            ? `The network refused the update: ${outcome.status}.`
            : outcome.kind === 'unverified'
              ? outcome.transactionId
              : 'The wallet answered but the mirror could not confirm. Check the explorer before retrying.'}
        </ErrorNote>
        <button type="button" onClick={() => setPhase('form')} className={primaryAction}>
          Back to the form
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>Signer keys ({signers.length}/10)</FieldLabel>
        <ul className="mb-3 space-y-2">
          {signers.map((signer) => (
            <li
              key={signer.id}
              className="flex items-baseline justify-between gap-3 border border-rule bg-page px-3 py-2"
            >
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
        <div className="grid gap-2 sm:grid-cols-[9rem_1fr_auto]">
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
        {formError ? (
          <p className="mt-2">
            <ErrorNote>{formError}</ErrorNote>
          </p>
        ) : null}
      </div>

      <label className="block max-w-[22rem]">
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

      {!singleSigner ? (
        <ErrorNote>
          This treasury is {structure.threshold} of {structure.keys.length}. Changing its key needs{' '}
          {structure.threshold} signatures in one transaction; one wallet session provides one. Use
          the SDK until the treasury is 1 of n.
        </ErrorNote>
      ) : !holdsCurrentKey ? (
        <ErrorNote>
          The update must be signed by a current treasury key. The connected wallet holds none of the{' '}
          {structure.keys.length}.
        </ErrorNote>
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

      <button
        type="button"
        className={primaryAction}
        disabled={phase !== 'form' || signers.length === 0 || !singleSigner || !holdsCurrentKey}
        onClick={() => void submit()}
      >
        {phase === 'submitting'
          ? 'Awaiting your wallet…'
          : phase === 'receipt'
            ? 'Reading the receipt…'
            : 'Update the key'}
      </button>
    </div>
  )
}
