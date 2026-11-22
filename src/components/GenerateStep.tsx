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
        title="Generate the key"
        note="One click, once. The key is created in the memory of this browser window and stays there until you close the window."
      />

      {!keys ? (
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void generate()}
            className={primaryAction}
          >
            {busy ? 'Generating the key…' : 'Generate the key'}
          </button>
          {failure ? (
            <p className="mt-4 border-l-2 border-accent pl-3 text-sm leading-relaxed text-sheet-ink-soft">
              Generation failed. Reload the page and try again.
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <ul className="space-y-2.5 text-[0.9375rem] leading-relaxed text-sheet-ink">
            <li>— 24 words generated</li>
            <li>— private key derived</li>
            <li>— public key derived</li>
          </ul>
          <div className="mt-8">
            <button type="button" onClick={onContinue} className={primaryAction}>
              Continue: the 24 words
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
