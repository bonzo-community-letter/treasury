import { proto } from '@hiero-ledger/proto'
import { bytesToBase64, bytesToHex } from './bytes'
import { derFromRaw, normalizeRawHex, type Curve } from './keys'

/**
 * Reading a treasury account's key structure back from the mirror.
 *
 * `/accounts/{id}` answers with `{ _type, key }`. A simple key arrives as
 * `ED25519` / `ECDSA_SECP256K1` with the raw hex; a threshold or key list
 * arrives as `ProtobufEncoded` with a hex-encoded `proto.Key`. The protobuf
 * is decoded with `proto.Key` from `@hiero-ledger/proto`:
 *
 *   { thresholdKey: { threshold, keys: { keys: [ Key… ] } } }
 *   { keyList:      { keys: { keys: [ Key… ] } } }
 *   { ed25519 | ECDSASecp256k1 }   (a single key)
 *
 * Verified against live account 0.0.10964694, a 2-of-3 ECDSA threshold.
 * Current builds of `@hiero-ledger/proto` carry the curve bytes directly on
 * the `Key` oneof (a flat `Uint8Array`); older builds nest them as
 * `{ key: bytes }`. Both shapes are accepted — see `bytesFromKeyField`.
 *
 * A plain `keyList` with no threshold means *every* key must sign, so the
 * app normalizes it to threshold = keys.length. The per-key base64 is what
 * the schedules endpoint matches: `signatures[].public_key_prefix` is base64
 * of the signer's full raw public key — 32 bytes ED25519, 33 bytes
 * compressed ECDSA (verified against a live schedule's creator key).
 */

export interface MirrorKeyObject {
  readonly _type: string
  readonly key: string
}

export interface TreasuryKey {
  readonly curve: Curve
  /** raw key hex, lowercase — 64 (ED25519) or 66 (ECDSA) */
  readonly raw: string
  /** base64 of the raw bytes — the comparison key for schedule signatures */
  readonly base64: string
  /** SPKI DER hex, lowercase — for display fingerprints */
  readonly der: string
}

export interface TreasuryKeyStructure {
  readonly threshold: number
  readonly keys: readonly TreasuryKey[]
}

export type DecodedKey =
  | { ok: true; structure: TreasuryKeyStructure }
  | { ok: false; error: string }

export function treasuryKey(curve: Curve, rawBytes: Uint8Array): TreasuryKey {
  const raw = bytesToHex(rawBytes)
  return { curve, raw, base64: bytesToBase64(rawBytes), der: derFromRaw(curve, raw) }
}

/**
 * The `proto.Key` shape as this decoder needs it, spelled structurally:
 * `@hiero-ledger/proto` types its nested messages with alias namespaces whose
 * shape drifts between versions, and the wire contract is stable and simple.
 */
interface ProtoKeyLike {
  ed25519?: Uint8Array | { key?: Uint8Array | null } | null
  ECDSASecp256k1?: Uint8Array | { key?: Uint8Array | null } | null
  thresholdKey?: { threshold?: number | null; keys?: { keys?: ProtoKeyLike[] | null } | null } | null
  keyList?: { keys?: ProtoKeyLike[] | null } | null
}

/** The curve bytes, flat or nested, or null. */
function bytesFromKeyField(field: Uint8Array | { key?: Uint8Array | null } | null | undefined): Uint8Array | null {
  if (!field) return null
  if (field instanceof Uint8Array) return field
  return field.key instanceof Uint8Array ? field.key : null
}

/** One protobuf `Key` → a TreasuryKey, or null for shapes this app does not represent. */
function fromProtoKey(pk: ProtoKeyLike): TreasuryKey | null {
  const ed = bytesFromKeyField(pk.ed25519)
  if (ed) return ed.length === 32 ? treasuryKey('ed25519', ed) : null
  const ecdsa = bytesFromKeyField(pk.ECDSASecp256k1)
  if (ecdsa) return ecdsa.length === 33 ? treasuryKey('ecdsa', ecdsa) : null
  return null
}

function hexBytes(hex: string): Uint8Array {
  if (!/^([0-9a-fA-F]{2})+$/.test(hex)) throw new Error('not hex')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** Decode the mirror's key object into the one structure the whole app works from. */
export function decodeMirrorKey(key: MirrorKeyObject | null | undefined): DecodedKey {
  if (!key || typeof key.key !== 'string' || key.key.length === 0) {
    return { ok: false, error: 'The account reported no key.' }
  }

  if (key._type === 'ED25519') {
    const raw = normalizeRawHex('ed25519', key.key)
    if (!raw) return { ok: false, error: 'The ED25519 account key did not parse.' }
    return { ok: true, structure: { threshold: 1, keys: [treasuryKey('ed25519', hexBytes(raw))] } }
  }

  if (key._type === 'ECDSA_SECP256K1' || key._type === 'ECDSA') {
    const raw = normalizeRawHex('ecdsa', key.key)
    if (!raw) return { ok: false, error: 'The ECDSA account key did not parse.' }
    return { ok: true, structure: { threshold: 1, keys: [treasuryKey('ecdsa', hexBytes(raw))] } }
  }

  if (key._type !== 'ProtobufEncoded') {
    return { ok: false, error: `This account's key type (${key._type}) is not one this app can read.` }
  }

  let decoded: ProtoKeyLike
  try {
    decoded = proto.Key.decode(hexBytes(key.key)) as unknown as ProtoKeyLike
  } catch {
    return { ok: false, error: "This account's key is protobuf-encoded, but not in a shape the decoder reads." }
  }

  if (decoded.thresholdKey) {
    const entries = decoded.thresholdKey.keys?.keys ?? []
    const keys = entries.map(fromProtoKey)
    if (entries.length === 0 || keys.some((entry) => entry === null)) {
      return { ok: false, error: 'The threshold key contains a nested key structure this app does not read.' }
    }
    const list = keys as TreasuryKey[]
    const threshold = decoded.thresholdKey.threshold ?? 0
    if (threshold < 1 || threshold > list.length) {
      return { ok: false, error: `The key reports a threshold of ${threshold} over ${list.length} keys.` }
    }
    return { ok: true, structure: { threshold, keys: list } }
  }

  if (decoded.keyList) {
    const entries = decoded.keyList.keys ?? []
    const keys = entries.map(fromProtoKey)
    if (entries.length === 0 || keys.some((entry) => entry === null)) {
      return { ok: false, error: 'The key list contains a nested key structure this app does not read.' }
    }
    // A plain KeyList requires every key: threshold = n.
    return { ok: true, structure: { threshold: entries.length, keys: keys as TreasuryKey[] } }
  }

  const single = fromProtoKey(decoded)
  if (single) return { ok: true, structure: { threshold: 1, keys: [single] } }

  return { ok: false, error: "This account's key is protobuf-encoded, but not in a shape the decoder reads." }
}

/** Is this raw key hex one of the structure's keys? */
export function structureHasRaw(structure: TreasuryKeyStructure | null, rawHex: string | null): boolean {
  if (!structure || !rawHex) return false
  const needle = rawHex.toLowerCase()
  return structure.keys.some((key) => key.raw === needle)
}

/**
 * Per-signer checkmarks: a schedule's `signatures[].public_key_prefix` is
 * base64 of the signer's raw public key. Order follows the structure's keys.
 */
export function matchSignatures(
  structure: TreasuryKeyStructure,
  signatures: ReadonlyArray<{ publicKeyPrefix: string }>,
): boolean[] {
  const prefixes = new Set(signatures.map((signature) => signature.publicKeyPrefix))
  return structure.keys.map((key) => prefixes.has(key.base64))
}
