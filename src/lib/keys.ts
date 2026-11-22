import { PublicKey } from '@hiero-ledger/sdk'
import { hexToBytes } from './bytes'

/**
 * Turning typed input into signer keys — ported from the treasury console,
 * widened: the ceremony's ED25519 keys are joined by ECDSA (secp256k1),
 * because treasuries created elsewhere (the live fixture is 2-of-3 ECDSA)
 * carry them, and a treasury whose signers are ECDSA must be readable and
 * buildable too.
 *
 * A signer key arrives as one of exactly four things:
 *
 * - an ED25519 SPKI DER hex string, `302a…` (88 hex) — what bonzo-key-setup
 *   hands out;
 * - a compressed ECDSA SPKI DER hex string, `302d…` (110 hex);
 * - a raw ED25519 key, 64 hex;
 * - a raw compressed ECDSA key, `02…`/`03…`, 66 hex.
 *
 * Every other shape gets a sentence explaining the refusal, never a stack
 * trace. Parsing itself is the SDK's `PublicKey.fromString`; the shape check
 * before it exists only to make the errors specific.
 */

/** Hard cap: ten signers is already a committee, not a treasury. */
export const MAX_SIGNERS = 10

export type Curve = 'ed25519' | 'ecdsa'

/** The two SPKI headers, byte-exact. */
export const ED25519_SPKI_PREFIX = '302a300506032b6570032100'
export const ECDSA_SPKI_PREFIX = '302d300706052b8104000a032200'

/** A signer as the app keeps it: what it is, and what it is called. */
export interface SignerKey {
  /** stable id for list keys; the raw hex itself */
  readonly id: string
  /** the signer's optional name */
  label: string
  /** SPKI DER hex, lowercase — `302a…` ED25519 or `302d…` ECDSA */
  readonly der: string
  /** raw key hex, lowercase — 64 (ED25519) or 66 (ECDSA); the dedupe identity */
  readonly raw: string
  readonly curve: Curve
}

export type ParsedKey = { ok: true; key: PublicKey } | { ok: false; error: string }

const HEX = /^[0-9a-fA-F]+$/

/** Which curve a lowercase DER hex belongs to; null for anything else. */
export function curveOfDer(der: string): Curve | null {
  if (der.startsWith(ED25519_SPKI_PREFIX)) return 'ed25519'
  if (der.startsWith(ECDSA_SPKI_PREFIX)) return 'ecdsa'
  return null
}

/**
 * Parse one input line into a public key, or explain the refusal.
 * Never throws: every failure comes back as a sentence for the UI.
 */
export function parseSignerKey(input: string): ParsedKey {
  const text = input.trim()
  if (text.length === 0) return { ok: false, error: 'Nothing to add yet — paste a public key first.' }
  if (!HEX.test(text)) {
    return {
      ok: false,
      error: 'Public keys are hex: a DER string starting 302a… (ED25519) or 302d… (ECDSA), or the raw key bytes.',
    }
  }
  const hex = text.toLowerCase()

  if (hex.startsWith(ED25519_SPKI_PREFIX) || hex.startsWith(ECDSA_SPKI_PREFIX)) {
    // ED25519 SPKI is 44 bytes (88 hex); ECDSA secp256k1 SPKI is 47 (94 hex).
    const expected = hex.startsWith(ED25519_SPKI_PREFIX) ? 88 : 94
    if (hex.length !== expected) {
      return {
        ok: false,
        error: `A DER public key of this kind is exactly ${expected} hex characters; this one is ${hex.length}.`,
      }
    }
    return parseViaSdk(hex, 'That is not a valid public key — the bytes after the DER header do not parse.')
  }

  if (hex.length === 64) {
    return parseViaSdk(hex, 'That is not a valid raw ED25519 public key.')
  }

  if (hex.length === 66 && (hex.startsWith('02') || hex.startsWith('03'))) {
    return parseViaSdk(hex, 'That is not a valid compressed ECDSA public key.')
  }

  if (hex.startsWith('04') && hex.length === 130) {
    return {
      ok: false,
      error: 'Uncompressed ECDSA keys are not accepted — paste the compressed form (66 hex) or the 302d… DER.',
    }
  }

  return {
    ok: false,
    error: 'A public key is ED25519 (64 raw hex, or 88 starting 302a…) or compressed ECDSA (66 raw hex, or 94 starting 302d…).',
  }
}

function parseViaSdk(hex: string, refusal: string): ParsedKey {
  try {
    return { ok: true, key: PublicKey.fromString(hex) }
  } catch {
    return { ok: false, error: refusal }
  }
}

/** `302a30…c7d3` — enough to recognise a key at a glance, never enough to mislead. */
export function fingerprint(der: string): string {
  return `${der.slice(0, 6)}…${der.slice(-4)}`
}

export interface AddSignerResult {
  ok: boolean
  list: SignerKey[]
  error?: string
}

/**
 * Append a parsed key to the signer list, enforcing the two rules the create
 * flow relies on: the same key never appears twice, and the committee stops
 * at MAX_SIGNERS. Pure — returns a new list, never mutates.
 */
export function addSigner(list: readonly SignerKey[], parsed: PublicKey, label: string): AddSignerResult {
  if (list.length >= MAX_SIGNERS) {
    return { ok: false, list: [...list], error: `A treasury takes at most ${MAX_SIGNERS} signer keys.` }
  }
  const der = parsed.toStringDer().toLowerCase()
  const raw = parsed.toStringRaw().toLowerCase()
  const curve = curveOfDer(der)
  if (!curve) {
    return { ok: false, list: [...list], error: 'The SDK produced a key this app cannot represent.' }
  }
  const duplicate = list.find((signer) => signer.raw === raw)
  if (duplicate) {
    const name = duplicate.label.trim().length > 0 ? duplicate.label.trim() : fingerprint(duplicate.der)
    return { ok: false, list: [...list], error: `That key is already in the list (${name}).` }
  }
  return {
    ok: true,
    list: [...list, { id: raw, label: label.trim(), der, raw, curve }],
  }
}

/** Remove one row by id. Pure. */
export function removeSigner(list: readonly SignerKey[], id: string): SignerKey[] {
  return list.filter((signer) => signer.id !== id)
}

/** The SPKI DER for a raw key hex and its curve — the shape accountKey mirrors. */
export function derFromRaw(curve: Curve, raw: string): string {
  return `${curve === 'ed25519' ? ED25519_SPKI_PREFIX : ECDSA_SPKI_PREFIX}${raw}`
}

/**
 * The mirror's plain-key hex (`_type: ED25519` / `ECDSA_SECP256K1`) → the raw
 * 32/33 bytes as lowercase hex. Compressed ECDSA passes through; the 65-byte
 * uncompressed form (`04…`) is compressed through the SDK so a treasury key
 * and an account key compare identically.
 */
export function normalizeRawHex(curve: Curve, hex: string): string | null {
  const value = hex.toLowerCase()
  if (curve === 'ed25519') return /^[0-9a-f]{64}$/.test(value) ? value : null
  if (/^(02|03)[0-9a-f]{64}$/.test(value)) return value
  if (/^04[0-9a-f]{128}$/.test(value)) {
    try {
      return PublicKey.fromBytesECDSA(hexToBytes(value)).toStringRaw().toLowerCase()
    } catch {
      return null
    }
  }
  return null
}
