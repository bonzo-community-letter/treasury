import type { HederaNetwork } from './hedera'
import { isAccountId } from './hedera'
import type { SignerKey } from './keys'
import { MAX_SIGNERS, curveOfDer } from './keys'

/**
 * The pure half of the app: everything a transaction is decided from,
 * computed without the SDK, without a wallet, and without the network. The
 * plan builders return the exact parameters; the only files that touch the
 * SDK are `lib/create.ts` and `lib/transfer.ts`, which turn a plan into the
 * bytes the wallet signs. That split is what makes this file testable with
 * `vitest run` alone. Ported from the treasury console, extended with the
 * transfer and schedule plans this app adds.
 */

export const MAX_MEMO_CHARS = 100
export const TINYBARS_PER_HBAR = 100_000_000n
export const DEFAULT_MAX_FEE_HBAR = '2'

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string }

function toTinybars(hbarDecimal: string): string {
  const parts = hbarDecimal.split('.')
  const whole = parts[0] ?? '0'
  const fraction = parts[1] ?? ''
  // Left-aligned into the 8-digit tinybar space; the field validation has
  // already refused more than 5 decimals, so nothing real is lost here.
  const padded = (fraction + '00000000').slice(0, 8)
  return (BigInt(whole) * TINYBARS_PER_HBAR + BigInt(padded)).toString()
}

/**
 * An HBAR amount as typed: non-negative, plain decimal, at most 5 fractional
 * digits. Hedera's smallest unit is 0.00000001 HBAR, but a treasury amount
 * with more than 5 decimals is a paste error, so the app draws the line
 * higher than the network does — deliberately.
 */
export function parseHbarAmount(value: string, field: string): Validated<string> {
  const text = value.trim()
  if (text.length === 0) return { ok: false, error: `${field}: enter an amount, or 0 for none.` }
  if (!/^\d+(\.\d{1,5})?$/.test(text)) {
    return { ok: false, error: `${field}: a plain decimal amount with at most 5 decimal places.` }
  }
  return { ok: true, value: toTinybars(text) }
}

/** An HBAR amount that must move value: strictly above zero. */
export function parseTransferAmount(value: string, field: string): Validated<string> {
  const parsed = parseHbarAmount(value, field)
  if (!parsed.ok) return parsed
  if (parsed.value === '0') return { ok: false, error: `${field}: the amount must be above zero.` }
  return parsed
}

/** The threshold as typed: 1 ≤ m ≤ n, integers only. */
export function validateThreshold(m: number, n: number): Validated<number> {
  if (!Number.isInteger(m)) return { ok: false, error: 'The threshold must be a whole number.' }
  if (n < 1) return { ok: false, error: 'Add at least one signer key before setting the threshold.' }
  if (m < 1) return { ok: false, error: 'The threshold is at least 1 — with 0, anyone could act.' }
  if (m > n) return { ok: false, error: `The threshold cannot exceed the ${n} key${n === 1 ? '' : 's'} in the list.` }
  return { ok: true, value: m }
}

/**
 * The helper sentence under the threshold field. It says what the number
 * means in practice, because the number alone is how m-of-n mistakes happen.
 */
export function thresholdHelper(m: number, n: number): string {
  if (n < 1) return 'Add a signer key first.'
  const valid = validateThreshold(m, n)
  if (!valid.ok) return valid.error
  if (n === 1) return '1 of 1 — that single signer must sign every transaction.'
  if (m === 1) return `1 of ${n} — either signer can act alone.`
  if (m === n) return `${m} of ${n} — every signer must sign every transaction.`
  return `${m} of ${n} — any ${m} of the ${n} signers can act together.`
}

/** The memo: optional, ≤ 100 characters, no control characters. */
export function validateMemo(memo: string): Validated<string> {
  const text = memo.trim()
  if (text.length === 0) return { ok: true, value: '' }
  if (text.length > MAX_MEMO_CHARS) {
    return { ok: false, error: `The memo is ${text.length} characters; the limit is ${MAX_MEMO_CHARS}.` }
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    return { ok: false, error: 'The memo contains control characters.' }
  }
  return { ok: true, value: text }
}

function validateAccountId(value: string, field: string): Validated<string> {
  const text = value.trim()
  if (!isAccountId(text)) return { ok: false, error: `${field}: an account id looks like 0.0.12345.` }
  return { ok: true, value: text }
}

/* ── Layer 3a: the treasury account create ─────────────────────────────── */

/** The plan: exactly the parameters of the AccountCreateTransaction. */
export interface AccountCreatePlan {
  readonly kind: 'accountCreate'
  readonly network: HederaNetwork
  /** signer keys as lowercase SPKI DER hex, in list order */
  readonly keyDers: readonly string[]
  /** the curve each DER belongs to, same order — the SDK parse needs it */
  readonly keyCurves: readonly ('ed25519' | 'ecdsa')[]
  /** m in the m-of-n threshold key */
  readonly threshold: number
  readonly memo: string
  /** decimal string, tinybars — a string so no float ever touches money */
  readonly initialBalanceTinybars: string
  readonly maxFeeTinybars: string
  /** false: the treasury account need not sign transactions it receives */
  readonly receiverSignatureRequired: false
}

export interface PlanInput {
  keys: readonly SignerKey[]
  threshold: number
  memo: string
  /** HBAR as typed, e.g. '0', '2.5' */
  initialHbar: string
  /** HBAR as typed; the form shows 2 by default */
  maxFeeHbar?: string
  network: HederaNetwork
}

/**
 * Build the exact transaction parameters, or every reason it cannot be built.
 *
 * On-chain the account key is a threshold key — protobuf
 * `Key.thresholdKey{m, [n keys]}`. In the current SDK there is no
 * `ThresholdKey` class: the same structure is a `KeyList` carrying a
 * threshold, and `lib/create.ts` constructs exactly that from these
 * parameters. The key is ALWAYS a threshold key — even at 1 of N — so the
 * treasury's shape on chain never depends on how many keys it started with.
 */
export function buildAccountCreatePlan(
  keys: readonly SignerKey[],
  threshold: number,
  memo: string,
  initialHbar: string,
  maxFeeHbar: string = DEFAULT_MAX_FEE_HBAR,
  network: HederaNetwork = 'mainnet',
): { ok: true; plan: AccountCreatePlan } | { ok: false; errors: string[] } {
  const errors: string[] = []

  let thresholdValue = 0
  const m = validateThreshold(threshold, keys.length)
  if (m.ok) thresholdValue = m.value
  else errors.push(m.error)

  let memoValue = ''
  const accountMemo = validateMemo(memo)
  if (accountMemo.ok) memoValue = accountMemo.value
  else errors.push(accountMemo.error)

  let balanceTinybars = ''
  const balance = parseHbarAmount(initialHbar, 'Initial balance')
  if (balance.ok) balanceTinybars = balance.value
  else errors.push(balance.error)

  let feeTinybars = ''
  const fee = parseHbarAmount(maxFeeHbar, 'Max fee')
  if (fee.ok) feeTinybars = fee.value
  else errors.push(fee.error)

  if (keys.length < 1) errors.push('Add at least one signer key.')
  if (keys.length > MAX_SIGNERS) errors.push(`A treasury takes at most ${MAX_SIGNERS} signer keys.`)

  const curves: ('ed25519' | 'ecdsa')[] = []
  const derShapes = [/^302a300506032b6570032100[0-9a-f]{64}$/, /^302d300706052b8104000a032200[0-9a-f]{66}$/]
  for (const key of keys) {
    const curve = curveOfDer(key.der)
    const shapeOk = derShapes.some((shape) => shape.test(key.der))
    if (!curve || !shapeOk) errors.push(`Signer key ${key.id.slice(0, 8)}… is not a DER public key (ED25519 302a… or ECDSA 302d…).`)
    else curves.push(curve)
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    plan: {
      kind: 'accountCreate',
      network,
      keyDers: keys.map((key) => key.der),
      keyCurves: curves,
      threshold: thresholdValue,
      memo: memoValue,
      initialBalanceTinybars: balanceTinybars,
      maxFeeTinybars: feeTinybars,
      receiverSignatureRequired: false,
    },
  }
}

/* ── Layer 3a′: changing the treasury's key ────────────────────────────── */

/**
 * The plan for an AccountUpdate that swaps the treasury's key — the only
 * thing this changes. The account keeps its id, its balance and its memo;
 * what moves is who can sign for it.
 *
 * Signed by the CURRENT key, not by the admin: on Hedera an account's own
 * key authorizes an update of that account. At 1-of-n one wallet can do it;
 * at m-of-n the transaction needs m signatures at once, which one wallet
 * session cannot produce — the UI says so rather than pretending.
 */
export interface AccountUpdatePlan {
  readonly kind: 'accountUpdate'
  readonly network: HederaNetwork
  readonly accountId: string
  /** the new signer keys as lowercase SPKI DER hex, in list order */
  readonly keyDers: readonly string[]
  readonly keyCurves: readonly ('ed25519' | 'ecdsa')[]
  readonly threshold: number
  readonly maxFeeTinybars: string
}

export interface AccountUpdateInput {
  network: HederaNetwork
  accountId: string
  keys: readonly SignerKey[]
  threshold: number
  /** what the chain holds right now — a no-op is refused, not submitted */
  currentKeyDers?: readonly string[]
  currentThreshold?: number
  maxFeeHbar?: string
}

const DER_SHAPES = [/^302a300506032b6570032100[0-9a-f]{64}$/, /^302d300706052b8104000a032200[0-9a-f]{66}$/]

/** Each key's curve, or the reason it is not a key this app accepts. */
function keyShapes(keys: readonly SignerKey[]): { curves: ('ed25519' | 'ecdsa')[]; errors: string[] } {
  const curves: ('ed25519' | 'ecdsa')[] = []
  const errors: string[] = []
  for (const key of keys) {
    const curve = curveOfDer(key.der)
    if (!curve || !DER_SHAPES.some((shape) => shape.test(key.der))) {
      errors.push(`Signer key ${key.id.slice(0, 8)}… is not a DER public key (ED25519 302a… or ECDSA 302d…).`)
    } else {
      curves.push(curve)
    }
  }
  return { curves, errors }
}

export function buildAccountUpdatePlan(
  input: AccountUpdateInput,
): { ok: true; plan: AccountUpdatePlan } | { ok: false; errors: string[] } {
  const errors: string[] = []

  let accountValue = ''
  const accountId = validateAccountId(input.accountId, 'Treasury account')
  if (accountId.ok) accountValue = accountId.value
  else errors.push(accountId.error)

  let thresholdValue = 0
  const m = validateThreshold(input.threshold, input.keys.length)
  if (m.ok) thresholdValue = m.value
  else errors.push(m.error)

  let feeTinybars = ''
  const fee = parseHbarAmount(input.maxFeeHbar ?? DEFAULT_MAX_FEE_HBAR, 'Max fee')
  if (fee.ok) feeTinybars = fee.value
  else errors.push(fee.error)

  if (input.keys.length < 1) errors.push('Add at least one signer key.')
  if (input.keys.length > MAX_SIGNERS) errors.push(`A treasury takes at most ${MAX_SIGNERS} signer keys.`)

  const { curves, errors: shapeErrors } = keyShapes(input.keys)
  errors.push(...shapeErrors)

  if (input.currentKeyDers && input.currentThreshold !== undefined) {
    const sameKeys =
      input.currentKeyDers.length === input.keys.length &&
      input.keys.every((key) => input.currentKeyDers?.includes(key.der))
    if (sameKeys && input.currentThreshold === input.threshold) {
      errors.push('The key on chain is already exactly this — there is nothing to change.')
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    plan: {
      kind: 'accountUpdate',
      network: input.network,
      accountId: accountValue,
      keyDers: input.keys.map((key) => key.der),
      keyCurves: curves,
      threshold: thresholdValue,
      maxFeeTinybars: feeTinybars,
    },
  }
}

/* ── Layer 3b: transfers, direct and scheduled ─────────────────────────── */

/** A plain CryptoTransfer debiting the treasury — the 1-of-N path. */
export interface TransferPlan {
  readonly kind: 'transfer'
  readonly network: HederaNetwork
  readonly treasuryAccountId: string
  readonly recipientAccountId: string
  readonly amountTinybars: string
  readonly memo: string
  readonly maxFeeTinybars: string
}

export function buildTransferPlan(
  network: HederaNetwork,
  treasuryAccountId: string,
  recipient: string,
  hbar: string,
  memo: string,
  maxFeeHbar: string = DEFAULT_MAX_FEE_HBAR,
): { ok: true; plan: TransferPlan } | { ok: false; errors: string[] } {
  const errors: string[] = []

  let recipientId = ''
  const recipientCheck = validateAccountId(recipient, 'Recipient')
  if (recipientCheck.ok) recipientId = recipientCheck.value
  else errors.push(recipientCheck.error)

  let amountTinybars = ''
  const amount = parseTransferAmount(hbar, 'Amount')
  if (amount.ok) amountTinybars = amount.value
  else errors.push(amount.error)

  let memoValue = ''
  const transferMemo = validateMemo(memo)
  if (transferMemo.ok) memoValue = transferMemo.value
  else errors.push(transferMemo.error)

  let feeTinybars = ''
  const fee = parseHbarAmount(maxFeeHbar, 'Max fee')
  if (fee.ok) feeTinybars = fee.value
  else errors.push(fee.error)

  if (recipientId && recipientId === treasuryAccountId) {
    errors.push('The recipient is the treasury itself — that moves nothing.')
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    plan: {
      kind: 'transfer',
      network,
      treasuryAccountId,
      recipientAccountId: recipientId,
      amountTinybars,
      memo: memoValue,
      maxFeeTinybars: feeTinybars,
    },
  }
}

/**
 * How long a schedule may wait for its signatures. The protocol maximum is
 * 62 days; the app offers the four spans a committee actually plans with.
 */
export const SCHEDULE_EXPIRY_OPTIONS = [
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 24 * 60, label: '24 hours' },
  { minutes: 7 * 24 * 60, label: '7 days' },
] as const

export const SCHEDULE_EXPIRY_DEFAULT_MINUTES = 30
export const SCHEDULE_EXPIRY_MAX_MINUTES = 62 * 24 * 60
export const SCHEDULE_EXPIRY_MAX_SECONDS = SCHEDULE_EXPIRY_MAX_MINUTES * 60

/**
 * The expiry as an absolute moment: after now (the network refuses a schedule
 * that is born expired) and inside the protocol's 62-day window.
 */
export function validateExpiry(expirySec: number, nowSec: number): Validated<number> {
  if (!Number.isFinite(expirySec) || !Number.isInteger(expirySec)) {
    return { ok: false, error: 'Choose a date and time for the expiry.' }
  }
  if (expirySec <= nowSec) return { ok: false, error: 'The expiry must be in the future.' }
  if (expirySec > nowSec + SCHEDULE_EXPIRY_MAX_SECONDS) {
    return { ok: false, error: `The network expires schedules after ${SCHEDULE_EXPIRY_MAX_MINUTES / (24 * 60)} days at most.` }
  }
  return { ok: true, value: expirySec }
}

/** An M-of-N path: the schedule that waits for the other signatures. */
export interface SchedulePlan {
  readonly kind: 'scheduleCreate'
  readonly network: HederaNetwork
  readonly treasuryAccountId: string
  readonly recipientAccountId: string
  readonly amountTinybars: string
  readonly memo: string
  /** absolute moment the network stops waiting, epoch seconds */
  readonly expirySec: number
  /** true: run at the expiry even when the threshold signed earlier */
  readonly waitForExpiry: boolean
  readonly maxFeeTinybars: string
}

export interface ScheduleInput {
  network: HederaNetwork
  treasuryAccountId: string
  recipient: string
  hbar: string
  memo: string
  /** absolute expiry, epoch seconds */
  expirySec: number
  waitForExpiry: boolean
  maxFeeHbar?: string
  /** the clock the expiry is judged against; a parameter so the plan stays pure */
  nowSec?: number
}

/**
 * The schedule's memo always says what is inside: a pending schedule is read
 * months later, and the memo is the one field every explorer shows first.
 */
export function defaultScheduleMemo(recipient: string): string {
  return `Open Letter Treasury transfer to ${recipient}`
}

export function buildSchedulePlan(
  input: ScheduleInput,
): { ok: true; plan: SchedulePlan } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000)

  let recipientId = ''
  const recipientCheck = validateAccountId(input.recipient, 'Recipient')
  if (recipientCheck.ok) recipientId = recipientCheck.value
  else errors.push(recipientCheck.error)

  let amountTinybars = ''
  const amount = parseTransferAmount(input.hbar, 'Amount')
  if (amount.ok) amountTinybars = amount.value
  else errors.push(amount.error)

  const memoSource =
    input.memo.trim().length > 0 ? input.memo : recipientId ? defaultScheduleMemo(recipientId) : ''
  let memoValue = ''
  const scheduleMemo = validateMemo(memoSource)
  if (scheduleMemo.ok) memoValue = scheduleMemo.value
  else errors.push(scheduleMemo.error)

  let expirySec = 0
  const expiryCheck = validateExpiry(input.expirySec, nowSec)
  if (expiryCheck.ok) expirySec = expiryCheck.value
  else errors.push(expiryCheck.error)

  let feeTinybars = ''
  const fee = parseHbarAmount(input.maxFeeHbar ?? DEFAULT_MAX_FEE_HBAR, 'Max fee')
  if (fee.ok) feeTinybars = fee.value
  else errors.push(fee.error)

  if (recipientId && recipientId === input.treasuryAccountId) {
    errors.push('The recipient is the treasury itself — that moves nothing.')
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    plan: {
      kind: 'scheduleCreate',
      network: input.network,
      treasuryAccountId: input.treasuryAccountId,
      recipientAccountId: recipientId,
      amountTinybars,
      memo: memoValue,
      expirySec,
      waitForExpiry: input.waitForExpiry,
      maxFeeTinybars: feeTinybars,
    },
  }
}

/** Plain-HBAR display of a tinybar decimal string; negatives keep the sign. */
export function formatHbar(tinybars: string | bigint): string {
  const value = typeof tinybars === 'bigint' ? tinybars : BigInt(tinybars)
  const magnitude = value < 0n ? -value : value
  const whole = magnitude / TINYBARS_PER_HBAR
  const fraction = magnitude % TINYBARS_PER_HBAR
  const sign = value < 0n ? '−' : ''
  if (fraction === 0n) return `${sign}${whole.toString()} HBAR`
  // 8 decimals: a tinybar is 0.00000001 HBAR, whatever the input allowed.
  const trimmed = fraction.toString().padStart(8, '0').replace(/0+$/, '')
  return `${sign}${whole.toString()}.${trimmed} HBAR`
}

/**
 * The "Max" amount: the whole balance, floored to the form's five decimals.
 * Flooring matters — a rounded-up maximum would exceed the balance, and the
 * dust it leaves is at most 0.00001 HBAR.
 */
export function hbarFromTinybarsForInput(tinybars: bigint): string {
  if (tinybars <= 0n) return '0'
  const perStep = TINYBARS_PER_HBAR / 100_000n // one 1e-5 HBAR step, in tinybars
  const steps = tinybars / perStep
  const whole = steps / 100_000n
  const fraction = (steps % 100_000n).toString().padStart(5, '0').replace(/0+$/, '')
  return fraction.length > 0 ? `${whole}.${fraction}` : `${whole}`
}
