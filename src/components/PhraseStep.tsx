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
        title="The 24 words"
        note="Write the words down in this order, from No. 1 to No. 24 — on paper or in your password manager. With the phrase, the key can always be restored."
      />

      <WordGrid words={words} />

      <div className="mt-5">
        <CopyButton text={words.join(' ')} label="Copy all 24 words" />
      </div>

      <div className="mt-8 border-t border-sheet-rule pt-6">
        <AckRow
          checked={saved}
          onChange={setSaved}
          text="I have stored all 24 words safely, in the right order."
        />
      </div>

      <div className="mt-6">
        <button
          type="button"
          disabled={!saved}
          onClick={onContinue}
          className={primaryAction}
        >
          Continue: spot checks
        </button>
        {!saved ? (
          <p className="mt-3 text-xs text-sheet-ink-faint">
            You can continue once you have confirmed.
          </p>
        ) : null}
      </div>
    </div>
  )
}
