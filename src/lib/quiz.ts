/**
 * The verification quiz: five spot checks of the saved phrase.
 * Pure functions so the rules are testable without a browser.
 */

/** How many positions the quiz asks for. */
export const QUIZ_SIZE = 5

/** After this many failed checks the page tells the user to start over with a fresh key. */
export const MAX_ATTEMPTS = 3

export type Rng = () => number

/**
 * `QUIZ_SIZE` distinct positions from `0 … wordCount-1`, ascending.
 *
 * `exclude` keeps positions out of the new set while enough positions remain —
 * after a failed round the quiz must ask different places, so the answer to the
 * old quiz cannot be carried over.
 */
export function pickQuizPositions(
  wordCount: number,
  rng: Rng = Math.random,
  exclude: readonly number[] = [],
): number[] {
  if (wordCount < QUIZ_SIZE) {
    throw new RangeError(`a ${QUIZ_SIZE}-position quiz needs at least ${QUIZ_SIZE} words`)
  }
  const all = Array.from({ length: wordCount }, (_, i) => i)
  const excluded = new Set(exclude)
  const pool = all.filter((i) => !excluded.has(i))
  const usable = pool.length >= QUIZ_SIZE ? pool : all

  const picked: number[] = []
  while (picked.length < QUIZ_SIZE) {
    const j = Math.min(usable.length - 1, Math.floor(rng() * usable.length))
    const taken = usable.splice(j, 1)
    const next = taken[0]
    if (next !== undefined) picked.push(next)
  }
  return picked.sort((a, b) => a - b)
}

/**
 * Compare answers (one per position, same order) with the words.
 * Case-insensitive, surrounding blanks ignored — a mistyped word still counts as
 * wrong, that is the point. The positions stay fixed; only the typing is checked.
 */
export function gradeQuiz(
  words: readonly string[],
  positions: readonly number[],
  answers: readonly string[],
): { allCorrect: boolean; wrongPositions: number[] } {
  const wrongPositions = positions.filter((position, i) => {
    const expected = words[position]?.trim().toLowerCase()
    const given = (answers[i] ?? '').trim().toLowerCase()
    return expected !== given
  })
  return { allCorrect: wrongPositions.length === 0, wrongPositions }
}

/** Failed checks count up, a correct check resets the count. */
export function registerAttempt(attempts: number, correct: boolean): number {
  return correct ? 0 : attempts + 1
}

export function attemptsExhausted(attempts: number): boolean {
  return attempts >= MAX_ATTEMPTS
}
