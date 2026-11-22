import { describe, expect, it } from 'vitest'
import { buildSecretFileText, secretFileName, slugifyRole } from './secretFile'
import type { GeneratedKeys } from './keys'

const KEYS: GeneratedKeys = {
  words: Array.from({ length: 24 }, (_, i) => `word${i + 1}`),
  privateDer: '302e' + 'ab'.repeat(45),
  publicDer: '302a' + 'cd'.repeat(44),
}

describe('slugifyRole', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyRole('Signer A')).toBe('signer-a')
    expect(slugifyRole(' ✓ / SIGNER 2 ')).toBe('signer-2')
  })

  it('falls back for empty or non-ascii roles', () => {
    expect(slugifyRole('')).toBe('participant')
    expect(slugifyRole('   ')).toBe('participant')
    expect(slugifyRole('!!!')).toBe('participant')
  })

  it('caps the length', () => {
    expect(slugifyRole('a'.repeat(80))).toHaveLength(32)
  })
})

describe('secretFileName', () => {
  it('names the file after the role', () => {
    expect(secretFileName('Signer A')).toBe('bonzo-key-signer-a.txt')
    expect(secretFileName('')).toBe('bonzo-key-participant.txt')
  })
})

describe('buildSecretFileText', () => {
  it('carries all three values and the derivation path', () => {
    const text = buildSecretFileText('Signer A', KEYS, '2026-11-22')
    expect(text).toContain('word1')
    expect(text).toContain('word24')
    expect(text).toContain('24. word24')
    expect(text).toContain(KEYS.privateDer)
    expect(text).toContain(KEYS.publicDer)
    expect(text).toContain("m/44'/3030'/0'/0'/0'")
    expect(text).toContain('DO NOT SHARE')
  })
})
