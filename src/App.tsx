import { useState } from 'react'
import { Sheet } from './components/Sheet'
import { StepTracker } from './components/StepTracker'
import { IntroStep } from './components/IntroStep'
import { GenerateStep } from './components/GenerateStep'
import { PhraseStep } from './components/PhraseStep'
import { QuizStep } from './components/QuizStep'
import { ReviewStep } from './components/ReviewStep'
import { DoneStep } from './components/DoneStep'
import type { GeneratedKeys } from './lib/keys'

const STEPS = [
  { id: 'intro', label: 'Vorbereitung' },
  { id: 'generate', label: 'Erzeugen' },
  { id: 'phrase', label: 'Phrase sichern' },
  { id: 'quiz', label: 'Nachprüfen' },
  { id: 'review', label: 'Schlüssel sichern' },
  { id: 'done', label: 'Fertig' },
] as const

type StepId = (typeof STEPS)[number]['id']
const LABELS = STEPS.map((step) => step.label)

/**
 * The ceremony, as six steps on one sheet. The only storage the key material ever
 * gets is this component's state: closing the page destroys it, and there is no
 * code path that sends it anywhere.
 */
export function App() {
  const [step, setStep] = useState<StepId>('intro')
  const [role, setRole] = useState('')
  const [keys, setKeys] = useState<GeneratedKeys | null>(null)

  const stepIndex = STEPS.findIndex((candidate) => candidate.id === step)

  /** throw away the key material and land back at the generator */
  const restart = (): void => {
    setKeys(null)
    setStep('generate')
  }

  return (
    <div className="min-h-dvh bg-page">
      <header className="sticky top-0 z-40 border-b border-rule/70 bg-page/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="font-serif text-[0.9375rem] leading-none tracking-wide text-ink-soft">
            Bonzo Recovery
          </span>
          <span className="text-[0.625rem] uppercase tracking-[0.16em] text-ink-faint">
            Schlüssel-Einrichtung
          </span>
        </div>
      </header>

      {/* the one sentence that belongs on every screen */}
      <p className="border-b border-rule/60 bg-hero py-2.5 text-center text-[0.75rem] leading-snug text-ink-soft">
        Diese Seite sendet nichts — aber der Rechner, an dem du das siehst, muss sauber sein.
      </p>

      <main className="mt-8 sm:mt-12">
        <Sheet>
          <StepTracker current={stepIndex} labels={LABELS} />

          {keys && step !== 'intro' && step !== 'done' ? (
            <div className="mb-6 flex justify-end">
              <button
                type="button"
                onClick={restart}
                className="text-[0.625rem] uppercase tracking-[0.16em] text-sheet-ink-faint transition-colors hover:text-accent"
              >
                Verwerfen und neu beginnen
              </button>
            </div>
          ) : null}

          {step === 'intro' ? (
            <IntroStep
              onBegin={(nextRole) => {
                setRole(nextRole)
                setStep('generate')
              }}
            />
          ) : null}

          {step === 'generate' ? (
            <GenerateStep
              keys={keys}
              onGenerated={setKeys}
              onContinue={() => setStep('phrase')}
            />
          ) : null}

          {step === 'phrase' && keys ? (
            <PhraseStep words={keys.words} onContinue={() => setStep('quiz')} />
          ) : null}

          {step === 'quiz' && keys ? (
            <QuizStep
              words={keys.words}
              onVerified={() => setStep('review')}
              onRestart={restart}
            />
          ) : null}

          {step === 'review' && keys ? (
            <ReviewStep keys={keys} role={role} onFinish={() => setStep('done')} />
          ) : null}

          {step === 'done' ? <DoneStep /> : null}
        </Sheet>
      </main>

      <footer className="border-t border-rule/60">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-4 py-7 sm:px-6">
          <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint">
            Läuft vollständig im Browser · legt kein Konto an
          </span>
          <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint">
            Bonzo Lend Recovery
          </span>
        </div>
      </footer>
    </div>
  )
}
