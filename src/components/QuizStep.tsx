import { useState } from 'react'
import { WordGrid } from './WordGrid'
import { primaryAction, secondaryAction, StepHeading } from './StepUi'
import {
  QUIZ_SIZE,
  attemptsExhausted,
  gradeQuiz,
  pickQuizPositions,
  registerAttempt,
} from '../lib/quiz'

interface Props {
  words: readonly string[]
  onVerified: () => void
  /** destroys the current key material and returns to the generator */
  onRestart: () => void
}

interface Quiz {
  positions: number[]
  answers: string[]
}

/** Five spot checks of the saved phrase; after three failures, start over. */
export function QuizStep({ words, onVerified, onRestart }: Props) {
  const [quiz, setQuiz] = useState<Quiz>(() => ({
    positions: pickQuizPositions(words.length),
    answers: Array<string>(QUIZ_SIZE).fill(''),
  }))
  const [wrongPositions, setWrongPositions] = useState<number[]>([])
  const [attempts, setAttempts] = useState(0)
  const [reveal, setReveal] = useState(false)

  const setAnswer = (index: number, value: string): void => {
    setQuiz((current) => {
      const answers = [...current.answers]
      answers[index] = value
      return { positions: current.positions, answers }
    })
  }

  const check = (): void => {
    const result = gradeQuiz(words, quiz.positions, quiz.answers)
    if (result.allCorrect) {
      onVerified()
      return
    }
    setWrongPositions(result.wrongPositions)
    setAttempts((current) => registerAttempt(current, false))
  }

  /** a new quiz that does not ask the same five places again */
  const reroll = (): void => {
    setQuiz({
      positions: pickQuizPositions(words.length, Math.random, quiz.positions),
      answers: Array<string>(QUIZ_SIZE).fill(''),
    })
    setWrongPositions([])
    setReveal(false)
  }

  const exhausted = attemptsExhausted(attempts)

  return (
    <div>
      <StepHeading
        title="Five spot checks"
        note="Type the words at the shown positions. This is no formality: only when you can reproduce the phrase does it truly sit with you — and not only in the memory of this window."
      />

      {reveal ? (
        <div>
          <WordGrid words={words} />
          <p className="mt-4 text-xs text-sheet-ink-faint">
            A spot check with different positions follows — your earlier entries will not
            help.
          </p>
          <div className="mt-6">
            <button type="button" onClick={reroll} className={primaryAction}>
              New spot check
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="grid gap-5 sm:grid-cols-2">
            {quiz.positions.map((position, index) => {
              const isWrong = wrongPositions.includes(position)
              return (
                <div key={position}>
                  <label
                    htmlFor={`quiz-${position}`}
                    className="eyebrow-sheet"
                  >
                    Word No. {position + 1}
                    {isWrong ? <span className="text-accent"> — wrong word</span> : null}
                  </label>
                  <input
                    id={`quiz-${position}`}
                    type="text"
                    value={quiz.answers[index] ?? ''}
                    onChange={(event) => setAnswer(index, event.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className={`mt-2 w-full border-b-2 bg-transparent px-1 py-1.5 font-mono text-[0.9375rem] text-sheet-ink outline-none transition-colors focus:border-accent ${
                      isWrong ? 'border-accent' : 'border-sheet-rule'
                    }`}
                  />
                </div>
              )
            })}
          </div>

          {wrongPositions.length > 0 ? (
            <div className="mt-6">
              <p className="border-l-2 border-accent pl-3 text-sm leading-relaxed text-sheet-ink-soft">
                Not right: {wrongPositions.map((p) => `No. ${p + 1}`).join(', ')}. The rest
                was fine.
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setReveal(true)}
                  className={secondaryAction}
                >
                  Show the phrase again
                </button>
              </div>
            </div>
          ) : null}

          {exhausted ? (
            <div className="mt-8">
              <p className="border-l-2 border-accent pl-3 text-sm leading-relaxed text-sheet-ink-soft">
                Three failed attempts. If the phrase cannot be reproduced with confidence,
                the clean path is to start over: the current key is discarded — never used,
                never written down — and a completely new one is created.
              </p>
              <div className="mt-4">
                <button type="button" onClick={onRestart} className={primaryAction}>
                  Start over
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-8">
            <button type="button" onClick={check} className={primaryAction}>
              Check
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
