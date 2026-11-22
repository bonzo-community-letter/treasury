import { useState } from 'react'
import { WordGrid } from './WordGrid'
import { CopyButton, DownloadButton } from './ValueButtons'
import { AckRow, StepHeading, primaryAction } from './StepUi'
import { DERIVATION_PATH, type GeneratedKeys } from '../lib/keys'
import { buildSecretFileText, secretFileName } from '../lib/secretFile'

interface Props {
  keys: GeneratedKeys
  role: string
  onFinish: () => void
}

type Ack = 'phrase' | 'private' | 'public'

/**
 * The last screen before "done": everything on one page — phrase, both keys, the
 * derivation path — each block with its own copy and download, so nothing has to be
 * scrolled back for.
 */
export function ReviewStep({ keys, role, onFinish }: Props) {
  const [acks, setAcks] = useState<Record<Ack, boolean>>({
    phrase: false,
    private: false,
    public: false,
  })
  const fileName = secretFileName(role)
  const fileText = buildSecretFileText(role, keys, formatDate(new Date()))
  const allAcked = acks.phrase && acks.private && acks.public

  return (
    <div>
      <StepHeading
        title="Overview"
        note="Once more, everything on one screen, before you close the window. What you do not save now is gone afterwards."
      />

      <section className="border-t border-sheet-rule pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="eyebrow-sheet">The 24 words</p>
          <span className="flex flex-wrap gap-3">
            <CopyButton text={keys.words.join(' ')} />
            <DownloadButton fileName={fileName} text={fileText} />
          </span>
        </div>
        <div className="mt-4">
          <WordGrid words={keys.words} />
        </div>
      </section>

      <section className="mt-8 border-t border-sheet-rule pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="eyebrow-sheet">Private key (302e…)</p>
          <span className="flex flex-wrap gap-3">
            <CopyButton text={keys.privateDer} />
            <DownloadButton fileName={fileName} text={fileText} />
          </span>
        </div>
        <p className="mt-3 break-all font-mono text-[0.8125rem] leading-relaxed text-sheet-ink">
          {keys.privateDer}
        </p>
        <p className="mt-2 text-xs text-sheet-ink-faint">
          Later, the import value for HashPack. Never share it.
        </p>
      </section>

      <section className="mt-8 border-t border-sheet-rule pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="eyebrow-sheet">Public key (302a…)</p>
          <span className="flex flex-wrap gap-3">
            <CopyButton text={keys.publicDer} />
            <DownloadButton fileName={fileName} text={fileText} />
          </span>
        </div>
        <p className="mt-3 break-all font-mono text-[0.8125rem] leading-relaxed text-sheet-ink">
          {keys.publicDer}
        </p>
        <p className="mt-2 text-xs text-sheet-ink-faint">
          This value goes to the coordinator — it is meant to be shared.
        </p>
      </section>

      <p className="mt-6 font-mono text-xs text-sheet-ink-faint">
        Derivation path {DERIVATION_PATH} — HashPack-compatible
      </p>

      <div className="mt-8 space-y-3 border-t border-sheet-rule pt-6">
        <AckRow
          checked={acks.phrase}
          onChange={(next) => setAcks((a) => ({ ...a, phrase: next }))}
          text="Phrase stored safely."
        />
        <AckRow
          checked={acks.private}
          onChange={(next) => setAcks((a) => ({ ...a, private: next }))}
          text="Private key stored safely."
        />
        <AckRow
          checked={acks.public}
          onChange={(next) => setAcks((a) => ({ ...a, public: next }))}
          text="Public key passed to the coordinator or filed safely."
        />
      </div>

      <div className="mt-8">
        <button
          type="button"
          disabled={!allAcked}
          onClick={onFinish}
          className={primaryAction}
        >
          Done
        </button>
      </div>
    </div>
  )
}

function formatDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
