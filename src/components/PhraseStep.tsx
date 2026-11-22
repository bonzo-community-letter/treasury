import { useState } from 'react'
import { WordGrid } from './WordGrid'
import { CopyButton } from './ValueButtons'
import { AckRow, StepHeading, primaryAction } from './StepUi'

interface Props {
  words: readonly string[]
  onContinue: () => void
}

export function PhraseStep({ words, onContinue }: Props) {
  const [saved, setSaved] = useState(false)

  return (
    <div>
      <StepHeading
        title="Die 24 Wörter"
        note="Notieren Sie die Wörter in dieser Reihenfolge, von Nr. 1 bis Nr. 24 — auf Papier oder im Passwort-Manager. Mit der Phrase ist der Schlüssel für immer wiederherstellbar."
      />

      <WordGrid words={words} />

      <div className="mt-5">
        <CopyButton text={words.join(' ')} label="Alle 24 Wörter kopieren" />
      </div>

      <div className="mt-8 border-t border-sheet-rule pt-6">
        <AckRow
          checked={saved}
          onChange={setSaved}
          text="Ich habe alle 24 Wörter in der richtigen Reihenfolge sicher gespeichert."
        />
      </div>

      <div className="mt-6">
        <button
          type="button"
          disabled={!saved}
          onClick={onContinue}
          className={primaryAction}
        >
          Weiter: Stichproben
        </button>
        {!saved ? (
          <p className="mt-3 text-xs text-sheet-ink-faint">
            Erst wenn Sie bestätigt haben, können Sie weiter.
          </p>
        ) : null}
      </div>
    </div>
  )
}
