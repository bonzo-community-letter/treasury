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
        title="Übersicht"
        note="Noch einmal alles auf einem Schirm, bevor Sie das Fenster schließen. Was Sie jetzt nicht sichern, ist danach fort."
      />

      <section className="border-t border-sheet-rule pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="eyebrow-sheet">Die 24 Wörter</p>
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
          <p className="eyebrow-sheet">Privater Schlüssel (302e…)</p>
          <span className="flex flex-wrap gap-3">
            <CopyButton text={keys.privateDer} />
            <DownloadButton fileName={fileName} text={fileText} />
          </span>
        </div>
        <p className="mt-3 break-all font-mono text-[0.8125rem] leading-relaxed text-sheet-ink">
          {keys.privateDer}
        </p>
        <p className="mt-2 text-xs text-sheet-ink-faint">
          Später der Importwert für HashPack. Niemals weitergeben.
        </p>
      </section>

      <section className="mt-8 border-t border-sheet-rule pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="eyebrow-sheet">Öffentlicher Schlüssel (302a…)</p>
          <span className="flex flex-wrap gap-3">
            <CopyButton text={keys.publicDer} />
            <DownloadButton fileName={fileName} text={fileText} />
          </span>
        </div>
        <p className="mt-3 break-all font-mono text-[0.8125rem] leading-relaxed text-sheet-ink">
          {keys.publicDer}
        </p>
        <p className="mt-2 text-xs text-sheet-ink-faint">
          Dieser Wert geht an den Koordinator — er ist zur Weitergabe gemacht.
        </p>
      </section>

      <p className="mt-6 font-mono text-xs text-sheet-ink-faint">
        Ableitungspfad {DERIVATION_PATH} — HashPack-kompatibel
      </p>

      <div className="mt-8 space-y-3 border-t border-sheet-rule pt-6">
        <AckRow
          checked={acks.phrase}
          onChange={(next) => setAcks((a) => ({ ...a, phrase: next }))}
          text="Phrase sicher gespeichert."
        />
        <AckRow
          checked={acks.private}
          onChange={(next) => setAcks((a) => ({ ...a, private: next }))}
          text="Privaten Schlüssel sicher gespeichert."
        />
        <AckRow
          checked={acks.public}
          onChange={(next) => setAcks((a) => ({ ...a, public: next }))}
          text="Öffentlichen Schlüssel an den Koordinator übermittelt oder sicher abgelegt."
        />
      </div>

      <div className="mt-8">
        <button
          type="button"
          disabled={!allAcked}
          onClick={onFinish}
          className={primaryAction}
        >
          Fertig
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
