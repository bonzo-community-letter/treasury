import { describe, expect, it } from 'vitest'
import { buildPublicKeyFileText, publicKeyFileName, slugifyRole } from './publicKeyFile'
import type { GeneratedKeys } from './keys'

const keys: GeneratedKeys = {
  words: Array.from({ length: 24 }, (_, i) => `word${i}`),
  privateDer: '302e' + 'ab'.repeat(46),
  publicDer: '302a' + 'cd'.repeat(43),
}

describe('slugifyRole', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyRole('Signer A')).toBe('signer-a')
  })
  it('falls back for empty input', () => {
    expect(slugifyRole('   ')).toBe('participant')
  })
})

describe('publicKeyFileName', () => {
  it('names the file after the role', () => {
    expect(publicKeyFileName('Signer A')).toBe('treasury-public-key-signer-a.txt')
    expect(publicKeyFileName('')).toBe('treasury-public-key-participant.txt')
  })
})

describe('buildPublicKeyFileText', () => {
  const text = buildPublicKeyFileText('Signer B', keys, '2026-11-22')

  it('carries the public key and the path', () => {
    expect(text).toContain(keys.publicDer)
    expect(text).toContain("m/44'/3030'/0'/0'/0'")
    expect(text).toContain('Signer B')
    expect(text).toContain('2026-11-22')
  })

  it('is the point of the design: no secret material in the file', () => {
    expect(text).not.toContain(keys.privateDer)
    expect(text).not.toContain('302e')
    for (const word of keys.words) {
      // the numbered word list must not leak in — check with boundaries so
      // ordinary prose is not mistaken for a word entry
      expect(new RegExp(`\\b${word}\\b`).test(text)).toBe(false)
    }
  })
})
