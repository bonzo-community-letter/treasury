import { useState } from 'react'
import { StepHeading, primaryAction } from './StepUi'
import { generateKeys, type GeneratedKeys } from '../lib/keys'

interface Props {
  keys: GeneratedKeys | null
  onGenerated: (keys: GeneratedKeys) => void
  onContinue: () => void
}

export function GenerateStep({ keys, onGenerated, onContinue }: Props) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(false)

  const generate = async (): Promise<void> => {
    setBusy(true)
    setFailure(false)
    try {
      onGenerated(await generateKeys())
    } catch {
      // the message may carry no secret; say only that it did not work
      setFailure(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <StepHeading
        title="Den Schlüssel erzeugen"
        note="Ein Klick, einmalig. Der Schlüssel entsteht im Speicher dieses Browserfensters und bleibt dort, bis Sie das Fenster schließen."
      />

      {!keys ? (
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void generate()}
            className={primaryAction}
          >
            {busy ? 'Erzeuge Schlüssel…' : 'Schlüssel erzeugen'}
          </button>
          {failure ? (
            <p className="mt-4 border-l-2 border-accent pl-3 text-sm leading-relaxed text-sheet-ink-soft">
              Die Erzeugung ist fehlgeschlagen. Laden Sie die Seite neu und versuchen Sie es
              erneut.
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <ul className="space-y-2.5 text-[0.9375rem] leading-relaxed text-sheet-ink">
            <li>— 24 Wörter erzeugt</li>
            <li>— privaten Schlüssel abgeleitet</li>
            <li>— öffentlichen Schlüssel abgeleitet</li>
          </ul>
          <div className="mt-8">
            <button type="button" onClick={onContinue} className={primaryAction}>
              Weiter: die 24 Wörter
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
