import { describe, expect, it } from 'vitest'
import {
  MAX_ATTEMPTS,
  QUIZ_SIZE,
  attemptsExhausted,
  gradeQuiz,
  pickQuizPositions,
  registerAttempt,
} from './quiz'

const WORDS = Array.from({ length: 24 }, (_, i) => `word${i + 1}`)

/** Deterministic rng: picks go in pool order (rng always returns 0 → index 0). */
const zeroRng = () => 0

describe('pickQuizPositions', () => {
  it('returns five distinct positions in range, ascending', () => {
    for (let run = 0; run < 50; run += 1) {
      const positions = pickQuizPositions(24)
      expect(positions).toHaveLength(QUIZ_SIZE)
      expect(new Set(positions).size).toBe(QUIZ_SIZE)
      expect(positions.every((p) => Number.isInteger(p) && p >= 0 && p < 24)).toBe(true)
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    }
  })

  it('excludes earlier positions on a repeated quiz', () => {
    const first = [3, 7, 11, 15, 19]
    const second = pickQuizPositions(24, Math.random, first)
    expect(second.some((p) => first.includes(p))).toBe(false)
    expect(second).toHaveLength(QUIZ_SIZE)
  })

  it('falls back to all positions when the exclusion leaves too few', () => {
    // 22 of 24 excluded leaves 2 usable positions — below QUIZ_SIZE, so it must
    // draw from the full set instead of looping forever
    const exclude = Array.from({ length: 22 }, (_, i) => i)
    const positions = pickQuizPositions(24, zeroRng, exclude)
    expect(positions).toHaveLength(QUIZ_SIZE)
  })

  it('refuses a word count below the quiz size', () => {
    expect(() => pickQuizPositions(QUIZ_SIZE - 1)).toThrow(RangeError)
  })
})

describe('gradeQuiz', () => {
  const positions = [10, 23, 0, 5, 17]

  it('accepts correct words, ignoring case and surrounding blanks', () => {
    const answers = ['  WORD11 ', 'word24', 'Word1', 'word6', 'WORD18']
    const result = gradeQuiz(WORDS, positions, answers)
    expect(result.allCorrect).toBe(true)
    expect(result.wrongPositions).toEqual([])
  })

  it('reports exactly the positions that were wrong', () => {
    const answers = ['word11', 'wrongword', 'word1', 'word6', ' ']
    const result = gradeQuiz(WORDS, positions, answers)
    expect(result.allCorrect).toBe(false)
    expect(result.wrongPositions).toEqual([23, 17])
  })

  it('treats a missing answer as wrong', () => {
    const result = gradeQuiz(WORDS, positions, ['word11', 'word24'])
    expect(result.allCorrect).toBe(false)
    expect(result.wrongPositions).toEqual([0, 5, 17])
  })
})

describe('attempt counting', () => {
  it('counts failures up and resets on success', () => {
    expect(registerAttempt(0, false)).toBe(1)
    expect(registerAttempt(1, false)).toBe(2)
    expect(registerAttempt(2, false)).toBe(3)
    expect(registerAttempt(3, true)).toBe(0)
  })

  it('is exhausted after three failures', () => {
    expect(attemptsExhausted(MAX_ATTEMPTS - 1)).toBe(false)
    expect(attemptsExhausted(MAX_ATTEMPTS)).toBe(true)
  })
})
