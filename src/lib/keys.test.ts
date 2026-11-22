import { describe, expect, it } from 'vitest'
import { PrivateKey } from '@hiero-ledger/sdk'
import { MAX_SIGNERS, addSigner, fingerprint, parseSignerKey, removeSigner } from './keys'

/** Real ED25519 keys from the SDK — the same strings a signer pastes. */
async function freshEd25519() {
  const priv = await PrivateKey.generateED25519()
  return priv.publicKey
}

describe('parseSignerKey — DER', () => {
  it('accepts a 302a… SPKI DER hex', async () => {
    const pub = await freshEd25519()
    const parsed = parseSignerKey(pub.toStringDer())
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.key.toStringRaw()).toBe(pub.toStringRaw())
  })

  it('accepts uppercase and surrounding whitespace', async () => {
    const pub = await freshEd25519()
    const parsed = parseSignerKey(`  ${pub.toStringDer().toUpperCase()}  `)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.key.toStringRaw()).toBe(pub.toStringRaw())
  })

  it('rejects a DER with the ED25519 header but the wrong length', () => {
    const parsed = parseSignerKey('302a300506032b6570032100' + 'ab'.repeat(20))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(/88 hex characters/)
  })

  it('rejects a truncated SPKI header', () => {
    const parsed = parseSignerKey('302a300506032b65000000' + 'ab'.repeat(33))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(/302a/)
  })
})

describe('parseSignerKey — raw ED25519', () => {
  it('accepts raw 64-hex', async () => {
    const pub = await freshEd25519()
    const parsed = parseSignerKey(pub.toStringRaw())
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.key.toStringDer()).toBe(pub.toStringDer())
  })

  it('rejects short hex', () => {
    expect(parseSignerKey('deadbeef').ok).toBe(false)
    const parsed = parseSignerKey('ab'.repeat(31))
    expect(parsed.ok).toBe(false)
  })

  it('rejects anything that is not hex', () => {
    const parsed = parseSignerKey('0x302a300506032b65700321 00zz')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(/hex/)
  })

  it('rejects an empty input with a human sentence', () => {
    const parsed = parseSignerKey('   ')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(/paste a public key/)
  })
})

describe('parseSignerKey — ECDSA', () => {
  it('accepts a compressed ECDSA DER SPKI (302d…)', async () => {
    const pub = PrivateKey.generateECDSA().publicKey
    const parsed = parseSignerKey(pub.toStringDer())
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.key.toStringRaw()).toBe(pub.toStringRaw())
  })

  it('accepts a raw ECDSA compressed key (02…)', async () => {
    const pub = PrivateKey.generateECDSA().publicKey
    const parsed = parseSignerKey(pub.toStringRaw())
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.key.toStringDer()).toBe(pub.toStringDer())
  })

  it('refuses the uncompressed ECDSA form with a sentence pointing at the fix', async () => {
    const pub = PrivateKey.generateECDSA().publicKey
    const uncompressed = `04${pub.toStringRaw().slice(2)}00`.slice(0, 130)
    const parsed = parseSignerKey(uncompressed)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(/compressed/)
  })
})

describe('fingerprint', () => {
  it('shows first six and last four of the DER', () => {
    expect(fingerprint('302a300506032b6570032100' + 'ab'.repeat(29) + 'c7d3')).toBe('302a30…c7d3')
  })
})

describe('addSigner', () => {
  it('adds and keeps the label', async () => {
    const pub = await freshEd25519()
    const result = addSigner([], pub, ' Alice ')
    expect(result.ok).toBe(true)
    expect(result.list).toHaveLength(1)
    expect(result.list[0]?.label).toBe('Alice')
    expect(result.list[0]?.der).toBe(pub.toStringDer().toLowerCase())
  })

  it('refuses the same key twice, by raw hex', async () => {
    const pub = await freshEd25519()
    const once = addSigner([], pub, 'Alice')
    const twice = addSigner(once.list, pub, 'Alice again')
    expect(twice.ok).toBe(false)
    expect(twice.list).toHaveLength(1)
    if (!twice.ok) expect(twice.error).toMatch(/already in the list \(Alice\)/)
  })

  it('names the duplicate by fingerprint when it has no label', async () => {
    const pub = await freshEd25519()
    const once = addSigner([], pub, '')
    const twice = addSigner(once.list, pub, '')
    expect(twice.ok).toBe(false)
    if (!twice.ok) expect(twice.error).toContain(fingerprint(pub.toStringDer().toLowerCase()))
  })

  it('caps the committee at MAX_SIGNERS', async () => {
    let list: ReturnType<typeof addSigner>['list'] = []
    for (let i = 0; i < MAX_SIGNERS; i += 1) {
      const pub = await freshEd25519()
      const result = addSigner(list, pub, `signer ${i + 1}`)
      expect(result.ok).toBe(true)
      list = result.list
    }
    expect(list).toHaveLength(MAX_SIGNERS)
    const overflow = addSigner(list, await freshEd25519(), 'one too many')
    expect(overflow.ok).toBe(false)
    if (!overflow.ok) expect(overflow.error).toMatch(/at most 10/)
  })

  it('does not mutate the list it was given', async () => {
    const pub = await freshEd25519()
    const before = addSigner([], pub, 'first').list
    const snapshot = [...before]
    addSigner(before, await freshEd25519(), 'second')
    expect(before).toEqual(snapshot)
  })
})

describe('removeSigner', () => {
  it('removes exactly the row with that id', async () => {
    const a = await freshEd25519()
    const b = await freshEd25519()
    const first = addSigner([], a, 'a').list
    const both = addSigner(first, b, 'b').list
    expect(removeSigner(both, both[0]!.id).map((s) => s.label)).toEqual(['b'])
  })
})
