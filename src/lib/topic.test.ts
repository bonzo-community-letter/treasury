import { describe, expect, it } from 'vitest'
import { buildTopicCreatePlan, topicMemoBytes, validateTopicMemo, TOPIC_MEMO_MAX_BYTES } from './topic'
import { treasuryKey } from './accountKey'

const structure = {
  threshold: 1,
  keys: [
    treasuryKey('ecdsa', new Uint8Array(33).fill(2)),
    treasuryKey('ed25519', new Uint8Array(32).fill(7)),
  ],
}

const base = {
  network: 'mainnet' as const,
  structure,
  memo: 'Open letter signatures',
  maxFeeHbar: '2',
}

describe('topicMemoBytes', () => {
  it('counts bytes, not characters', () => {
    expect(topicMemoBytes('abc')).toBe(3)
    expect(topicMemoBytes('ä')).toBe(2)
    expect(topicMemoBytes('✓')).toBe(3)
  })
})

describe('validateTopicMemo', () => {
  it('accepts an empty memo and one at the limit', () => {
    expect(validateTopicMemo('')).toEqual({ ok: true, value: '' })
    expect(validateTopicMemo('a'.repeat(TOPIC_MEMO_MAX_BYTES))).toEqual({
      ok: true,
      value: 'a'.repeat(TOPIC_MEMO_MAX_BYTES),
    })
  })

  it('refuses a memo over the byte limit, even when the characters fit', () => {
    const over = validateTopicMemo('ä'.repeat(51))
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.error).toMatch(/102 bytes/)
  })

  it('refuses control characters', () => {
    expect(validateTopicMemo('a\u0001b').ok).toBe(false)
  })
})

describe('buildTopicCreatePlan', () => {
  it('carries the treasury key as the admin key, threshold and all', () => {
    const built = buildTopicCreatePlan({ ...base, structure: { ...structure, threshold: 2 } })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.plan.kind).toBe('topicCreate')
    expect(built.plan.memo).toBe('Open letter signatures')
    expect(built.plan.adminKey.threshold).toBe(2)
    expect(built.plan.adminKey.keys.map((key) => key.curve)).toEqual(['ecdsa', 'ed25519'])
    expect(built.plan.adminKey.keys[0]?.der).toBe(structure.keys[0]?.der)
    expect(built.plan.maxFeeTinybars).toBe('200000000')
  })

  it('defaults the fee cap when none is given', () => {
    const built = buildTopicCreatePlan({ ...base, maxFeeHbar: undefined })
    expect(built.ok && built.plan.maxFeeTinybars).toBe('200000000')
  })

  it('refuses a fee that is not a plain decimal', () => {
    const built = buildTopicCreatePlan({ ...base, maxFeeHbar: '2,5' })
    expect(built.ok).toBe(false)
    if (!built.ok) expect(built.errors.join(' ')).toMatch(/Max fee/)
  })

  it('refuses a structure it cannot make a key list from', () => {
    expect(buildTopicCreatePlan({ ...base, structure: { threshold: 1, keys: [] } }).ok).toBe(false)
    expect(
      buildTopicCreatePlan({ ...base, structure: { ...structure, threshold: 3 } }).ok,
    ).toBe(false)
  })
})
