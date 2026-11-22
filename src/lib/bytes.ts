import { Buffer } from 'buffer'

/**
 * The small byte/number conversions this app keeps needing: hex in, base64
 * out, and the protobufjs Long (`{ low, high, unsigned }`) that
 * `@hiero-ledger/proto` hands back for every 64-bit amount. `buffer` is the
 * same polyfill the sibling repos pin; money math stays in BigInt.
 */

export function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^([0-9a-fA-F]{2})+$/.test(hex)) throw new Error('not hex')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

export function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'))
}

export interface PbLong {
  low: number
  high: number
  unsigned?: boolean
}

/**
 * A protobufjs Long as a BigInt, sign included. A negative scheduled amount
 * (a debit) arrives as two's complement: high bit set — undo that, or a
 * treasury outflow reads as 18 exabytes.
 */
export function longToBigInt(value: PbLong | null | undefined): bigint {
  if (!value) return 0n
  const low = BigInt(value.low >>> 0)
  const high = BigInt(value.high >>> 0)
  const raw = (high << 32n) | low
  if (value.unsigned) return raw
  return high >= 0x80000000n ? raw - (1n << 64n) : raw
}
