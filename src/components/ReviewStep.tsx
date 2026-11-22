import { CopyButton, DownloadButton } from './ValueButtons'
import { AckRow, StepHeading, primaryAction } from './StepUi'
import { useState } from 'react'
import { DERIVATION_PATH, type GeneratedKeys } from '../lib/keys'
import { buildPublicKeyFileText, publicKeyFileName } from '../lib/publicKeyFile'

interface Props {
  keys: GeneratedKeys
  role: string
  onFinish: () => void
}

type Ack = 'phrase' | 'public'

/**
 * The last screen before "done": the one value this page hands over digitally —
 * the public key. The private key is deliberately not shown and not written to
 * any file: it derives from the 24 words, which live on paper, not in a browser.
 */
export function ReviewStep({ keys, role, onFinish }: Props) {
  const [acks, setAcks] = useState<Record<Ack, boolean>>({ phrase: false, public: false })
  const fileName = publicKeyFileName(role)
  const fileText = buildPublicKeyFileText(role, keys, formatDate(new Date()))
  const allAcked = acks.phrase && acks.public

  return (
    <div>
      <StepHeading
        title="Public key"
        note="The public key is the only value this page leaves behind on purpose — it is meant to be shared. The private key exists only as long as the phrase does: derive it from the words on your paper, never from a screen."
      />

      <section className="border-t border-sheet-rule pt-6">
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
          This value goes to the coordinator. The download carries nothing but public data.
        </p>
      </section>

      <p className="mt-6 font-mono text-xs text-sheet-ink-faint">
        Derivation path {DERIVATION_PATH} — HashPack-compatible
      </p>

      <div className="mt-8 space-y-3 border-t border-sheet-rule pt-6">
        <AckRow
          checked={acks.phrase}
          onChange={(next) => setAcks((a) => ({ ...a, phrase: next }))}
          text="Phrase stored safely — on paper or in a password manager, out of this window's reach."
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
