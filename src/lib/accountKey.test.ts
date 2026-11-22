import { describe, expect, it } from 'vitest'
import { proto } from '@hiero-ledger/proto'
import { decodeMirrorKey, matchSignatures, structureHasRaw, treasuryKey } from './accountKey'

/**
 * The key of live mainnet account 0.0.10964694, fetched from
 * https://mainnet-public.mirrornode.hedera.com/api/v1/accounts/0.0.10964694
 * — a 2-of-3 ECDSA threshold. The hex is baked in so the decoder is tested
 * against bytes the network actually served, not only fixtures we wrote.
 */
const LIVE_MAINNET_KEY_HEX =
  '2a730802126f0a233a210210fd7826305f443aba34bc79f43452bbf8870e60e06333b4fcdcfbe3366da7d6' +
  '0a233a2102eb16f61a2efd37672b524c680a115f28db7f00128c0e9715c69b6c9bb2aa2ee5' +
  '0a233a21030b64e44169c93bda625a64190d757a23b794fee711b2ecdded6ab1820c9abf20'

const LIVE_MAINNET_RAW = [
  '0210fd7826305f443aba34bc79f43452bbf8870e60e06333b4fcdcfbe3366da7d6',
  '02eb16f61a2efd37672b524c680a115f28db7f00128c0e9715c69b6c9bb2aa2ee5',
  '030b64e44169c93bda625a64190d757a23b794fee711b2ecdded6ab1820c9abf20',
]

const hexOfBytes = (hex: string): Uint8Array => new Uint8Array(Buffer.from(hex, 'hex'))
const hexOfProtoKey = (key: Parameters<typeof proto.Key.encode>[0]): string =>
  Buffer.from(proto.Key.encode(proto.Key.create(key)).finish()).toString('hex')

const ed25519Bytes = (seed: number): Uint8Array => new Uint8Array(32).fill(seed)
const ecdsaBytes = (seed: number): Uint8Array => new Uint8Array([0x02, ...new Uint8Array(32).fill(seed)])

describe('decodeMirrorKey — the live mainnet fixture', () => {
  const decoded = decodeMirrorKey({ _type: 'ProtobufEncoded', key: LIVE_MAINNET_KEY_HEX })

  it('reads the 2-of-3 ECDSA threshold exactly', () => {
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.structure.threshold).toBe(2)
    expect(decoded.structure.keys).toHaveLength(3)
    expect(decoded.structure.keys.map((key) => key.curve)).toEqual(['ecdsa', 'ecdsa', 'ecdsa'])
    expect(decoded.structure.keys.map((key) => key.raw)).toEqual(LIVE_MAINNET_RAW)
  })

  it('gives each key the base64 the schedules endpoint compares against', () => {
    if (!decoded.ok) return
    decoded.structure.keys.forEach((key, index) => {
      expect(key.base64).toBe(Buffer.from(LIVE_MAINNET_RAW[index]!, 'hex').toString('base64'))
    })
    // the live creator key of schedule 0.0.10964595: public_key_prefix matched
    // its raw account key — same construction, same comparison.
    const [first] = decoded.structure.keys
    expect(first!.base64.length).toBe(44) // 33 bytes in base64
  })

  it('answers structureHasRaw, and answers false for a stranger key', () => {
    if (!decoded.ok) return
    expect(structureHasRaw(decoded.structure, LIVE_MAINNET_RAW[1]!.toUpperCase())).toBe(true)
    expect(structureHasRaw(decoded.structure, '03'.repeat(33))).toBe(false)
    expect(structureHasRaw(decoded.structure, null)).toBe(false)
  })

  it('matches a signature prefix against the right key, in order', () => {
    if (!decoded.ok) return
    const flags = matchSignatures(decoded.structure, [{ publicKeyPrefix: decoded.structure.keys[2]!.base64 }])
    expect(flags).toEqual([false, false, true])
  })
})

describe('decodeMirrorKey — constructed shapes', () => {
  it('threshold key with mixed curves', () => {
    const hex = hexOfProtoKey({
      thresholdKey: {
        threshold: 2,
        keys: {
          keys: [{ ed25519: ed25519Bytes(7) }, { ECDSASecp256k1: ecdsaBytes(8) }, { ed25519: ed25519Bytes(9) }],
        },
      },
    })
    const decoded = decodeMirrorKey({ _type: 'ProtobufEncoded', key: hex })
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.structure.threshold).toBe(2)
    expect(decoded.structure.keys.map((key) => key.curve)).toEqual(['ed25519', 'ecdsa', 'ed25519'])
  })

  it('plain key list means every signer: threshold = n', () => {
    const hex = hexOfProtoKey({
      keyList: { keys: [{ ed25519: ed25519Bytes(1) }, { ed25519: ed25519Bytes(2) }, { ECDSASecp256k1: ecdsaBytes(3) }] },
    })
    const decoded = decodeMirrorKey({ _type: 'ProtobufEncoded', key: hex })
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.structure.threshold).toBe(3)
    expect(decoded.structure.keys).toHaveLength(3)
  })

  it('a single protobuf key reads as 1 of 1', () => {
    const hex = hexOfProtoKey({ ed25519: ed25519Bytes(4) })
    const decoded = decodeMirrorKey({ _type: 'ProtobufEncoded', key: hex })
    expect(decoded.ok).toBe(true)
    if (decoded.ok) {
      expect(decoded.structure.threshold).toBe(1)
      expect(decoded.structure.keys[0]!.raw).toBe('04'.repeat(32))
    }
  })

  it('simple mirror key types pass through, uncompressed ECDSA compressed', () => {
    const ed = decodeMirrorKey({ _type: 'ED25519', key: 'ab'.repeat(32) })
    expect(ed.ok && ed.structure.threshold).toBe(1)
    const compressed = decodeMirrorKey({ _type: 'ECDSA_SECP256K1', key: `02${'cd'.repeat(32)}` })
    expect(compressed.ok && compressed.structure.keys[0]!.raw).toBe(`02${'cd'.repeat(32)}`)
    // the uncompressed form of the SAME key must normalize to the compressed
    // raw so a treasury key and an account key compare identically.
    const rawOfSdk = '0210fd7826305f443aba34bc79f43452bbf8870e60e06333b4fcdcfbe3366da7d6'
    const uncompressedHex = `04${rawOfSdk.slice(2)}${'11'.repeat(32)}`
    const uncompressed = decodeMirrorKey({ _type: 'ECDSA_SECP256K1', key: uncompressedHex })
    // note: this is only equal when the trailing 32 bytes are the real y — the
    // SDK parses the point; a bogus y must fail, not pass silently.
    expect(uncompressed.ok).toBe(false)
  })
})

describe('decodeMirrorKey — refusals', () => {
  it('no key at all', () => {
    expect(decodeMirrorKey(null).ok).toBe(false)
    expect(decodeMirrorKey({ _type: 'ED25519', key: '' }).ok).toBe(false)
  })

  it('unknown key type says so', () => {
    const decoded = decodeMirrorKey({ _type: 'RSA_PUBLIC_KEY', key: 'aabb' })
    expect(decoded.ok).toBe(false)
    if (!decoded.ok) expect(decoded.error).toMatch(/not one this app can read/)
  })

  it('protobuf garbage does not become a structure', () => {
    expect(decodeMirrorKey({ _type: 'ProtobufEncoded', key: 'zzzz' }).ok).toBe(false)
    const half = decodeMirrorKey({ _type: 'ProtobufEncoded', key: '2a730802126f0a233a21' + 'ab'.repeat(10) })
    expect(half.ok).toBe(false)
  })

  it('a threshold outside 1..n is reported, not clamped', () => {
    const hex = hexOfProtoKey({
      thresholdKey: { threshold: 5, keys: { keys: [{ ed25519: ed25519Bytes(1) }, { ed25519: ed25519Bytes(2) }] } },
    })
    const decoded = decodeMirrorKey({ _type: 'ProtobufEncoded', key: hex })
    expect(decoded.ok).toBe(false)
    if (!decoded.ok) expect(decoded.error).toMatch(/threshold of 5 over 2 keys/)
  })

  it('nested complex keys are refused as what they are', () => {
    const inner = proto.Key.create({
      thresholdKey: { threshold: 1, keys: { keys: [{ ed25519: ed25519Bytes(3) }] } },
    })
    const hex = Buffer.from(
      proto.Key.encode(
        proto.Key.create({
          thresholdKey: { threshold: 2, keys: { keys: [{ ed25519: ed25519Bytes(1) }, inner] } },
        }),
      ).finish(),
    ).toString('hex')
    const decoded = decodeMirrorKey({ _type: 'ProtobufEncoded', key: hex })
    expect(decoded.ok).toBe(false)
    if (!decoded.ok) expect(decoded.error).toMatch(/nested key structure/)
  })
})

describe('treasuryKey', () => {
  it('spells raw, base64 and DER from the same bytes', () => {
    const key = treasuryKey('ed25519', hexOfBytes('ab'.repeat(32)))
    expect(key.raw).toBe('ab'.repeat(32))
    expect(key.base64).toBe(Buffer.from('ab'.repeat(32), 'hex').toString('base64'))
    expect(key.der).toBe(`302a300506032b6570032100${'ab'.repeat(32)}`)
  })
})
