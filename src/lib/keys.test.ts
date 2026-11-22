import { describe, expect, it } from 'vitest'
import { Mnemonic } from '@hiero-ledger/sdk'
import { generateKeys } from './keys'

/**
 * HashPack-compatibility anchor.
 *
 * Two vectors whose expected DER values were cross-checked at creation time between
 * (a) @hiero-ledger/sdk 2.79.0 `Mnemonic.fromString(…).toStandardEd25519PrivateKey()`
 * and (b) an independent derivation: BIP-39 seed via PBKDF2-HMAC-SHA512 (2048 rounds,
 * salt "mnemonic") plus SLIP-0010 ed25519 at m/44'/3030'/0'/0'/0', DER-wrapped with
 * node:crypto — equal down to the byte. The phrases are the all-zero and all-ones
 * entropy vectors of BIP-39 (24 words each, checksum per spec).
 *
 * If these tests ever go red, the keys this page hands out no longer match what
 * HashPack derives on import. The ceremony must stop until that is understood.
 */
const VECTORS = [
  {
    name: 'BIP-39 all-zero entropy (24 words)',
    phrase: `${Array(23).fill('abandon').join(' ')} art`,
    privateDer:
      '302e020100300506032b657004220420' +
      '9f575af0ded30d60f72fe147bb61e8bc359e32d337c65d78b5cd9ab1c34ca5c9',
    publicDer:
      '302a300506032b6570032100' +
      '1aeb9fe89cdd270b5b5905eaed50e5f97ae884f5de2fb58fadc4271f72778884',
  },
  {
    name: 'BIP-39 all-ones entropy (24 words)',
    phrase: `${Array(23).fill('zoo').join(' ')} vote`,
    privateDer:
      '302e020100300506032b657004220420' +
      'dd0aec9d09d7e6ef67503ba089065c0e9f41405f11625e2e255b26f4709dc491',
    publicDer:
      '302a300506032b6570032100' +
      '2b51f9255310d5a021968f510ec405d67ed8eaef07a7205c1626f31baa49ea0b',
  },
] as const

describe('HashPack-compatibility vectors', () => {
  for (const vector of VECTORS) {
    it(`${vector.name} derives the expected DER keys`, async () => {
      const mnemonic = await Mnemonic.fromString(vector.phrase)
      const privateKey = await mnemonic.toStandardEd25519PrivateKey()
      expect(privateKey.toStringDer()).toBe(vector.privateDer)
      expect(privateKey.publicKey.toStringDer()).toBe(vector.publicDer)
    })
  }
})

describe('generateKeys', () => {
  it('produces 24 words and HashPack-shaped DER strings', async () => {
    const keys = await generateKeys()
    expect(keys.words).toHaveLength(24)
    expect(keys.words.every((word) => /^[a-z]+$/.test(word))).toBe(true)
    expect(keys.privateDer.startsWith('302e')).toBe(true)
    expect(keys.publicDer.startsWith('302a')).toBe(true)
  })

  it('regenerating from the words reproduces the same keys', async () => {
    const keys = await generateKeys()
    const restored = await (
      await Mnemonic.fromString(keys.words.join(' '))
    ).toStandardEd25519PrivateKey()
    expect(restored.toStringDer()).toBe(keys.privateDer)
    expect(restored.publicKey.toStringDer()).toBe(keys.publicDer)
  })
})
