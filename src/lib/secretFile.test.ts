import { describe, expect, it } from 'vitest'
import { buildSecretFileText, secretFileName, slugifyRole } from './secretFile'
import type { GeneratedKeys } from './keys'

const KEYS: GeneratedKeys = {
  words: Array.from({ length: 24 }, (_, i) => `wort${i + 1}`),
  privateDer: '302e' + 'ab'.repeat(45),
  publicDer: '302a' + 'cd'.repeat(44),
}

describe('slugifyRole', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyRole('Zeichner A')).toBe('zeichner-a')
    expect(slugifyRole(' äöü / SIGNER 2 ')).toBe('signer-2')
  })

  it('falls back for empty or non-ascii roles', () => {
    expect(slugifyRole('')).toBe('teilnehmer')
    expect(slugifyRole('   ')).toBe('teilnehmer')
    expect(slugifyRole('!!!')).toBe('teilnehmer')
  })

  it('caps the length', () => {
    expect(slugifyRole('a'.repeat(80))).toHaveLength(32)
  })
})

describe('secretFileName', () => {
  it('names the file after the role', () => {
    expect(secretFileName('Zeichner A')).toBe('bonzo-key-zeichner-a.txt')
    expect(secretFileName('')).toBe('bonzo-key-teilnehmer.txt')
  })
})

describe('buildSecretFileText', () => {
  it('carries all three values and the derivation path', () => {
    const text = buildSecretFileText('Zeichner A', KEYS, '2026-11-22')
    expect(text).toContain('wort1')
    expect(text).toContain('wort24')
    expect(text).toContain('24. wort24')
    expect(text).toContain(KEYS.privateDer)
    expect(text).toContain(KEYS.publicDer)
    expect(text).toContain("m/44'/3030'/0'/0'/0'")
    expect(text).toContain('NICHT TEILEN')
  })
})
