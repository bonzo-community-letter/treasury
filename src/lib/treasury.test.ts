import { describe, expect, it } from 'vitest'
import { PrivateKey } from '@hiero-ledger/sdk'
import { proto } from '@hiero-ledger/proto'
import {
  buildAccountCreatePlan,
  buildSchedulePlan,
  buildTransferPlan,
  defaultScheduleMemo,
  formatHbar,
  parseHbarAmount,
  parseTransferAmount,
  thresholdHelper,
  validateExpiryMinutes,
  validateMemo,
  validateThreshold,
} from './treasury'
import type { SignerKey } from './keys'
import { curveOfDer, derFromRaw, parseSignerKey } from './keys'

function toSigner(pub: { toStringDer(): string; toStringRaw(): string }, label: string): SignerKey {
  const der = pub.toStringDer().toLowerCase()
  const raw = pub.toStringRaw().toLowerCase()
  const curve = curveOfDer(der)
  if (!curve) throw new Error('fixture key produced no curve')
  return { id: raw, label, der, raw, curve }
}

async function edSigner(label: string): Promise<SignerKey> {
  return toSigner((await PrivateKey.generateED25519()).publicKey, label)
}

function ecdsaSigner(label: string): SignerKey {
  return toSigner(PrivateKey.generateECDSA().publicKey, label)
}

describe('parseHbarAmount', () => {
  it('reads plain decimals into tinybars', () => {
    expect(parseHbarAmount('2', 'x')).toEqual({ ok: true, value: '200000000' })
    expect(parseHbarAmount('0', 'x')).toEqual({ ok: true, value: '0' })
    expect(parseHbarAmount(' 2.5 ', 'x')).toEqual({ ok: true, value: '250000000' })
    expect(parseHbarAmount('0.00001', 'x')).toEqual({ ok: true, value: '1000' })
  })

  it('refuses more than 5 decimals, signs, scientific notation and non-numbers', () => {
    for (const bad of ['0.123456', '-5', '1e9', '12,000', 'twelve', '']) {
      expect(parseHbarAmount(bad, 'Amount').ok).toBe(false)
    }
  })
})

describe('parseTransferAmount', () => {
  it('requires value above zero', () => {
    expect(parseTransferAmount('0', 'Amount')).toEqual({ ok: false, error: 'Amount: the amount must be above zero.' })
    expect(parseTransferAmount('1', 'Amount')).toEqual({ ok: true, value: '100000000' })
  })
})

describe('validateThreshold', () => {
  it('accepts 1 ≤ m ≤ n', () => {
    expect(validateThreshold(2, 3)).toEqual({ ok: true, value: 2 })
    expect(validateThreshold(1, 1)).toEqual({ ok: true, value: 1 })
  })

  it('explains the ways it fails', () => {
    const zero = validateThreshold(0, 3)
    if (!zero.ok) expect(zero.error).toMatch(/at least 1/)
    const over = validateThreshold(4, 3)
    if (!over.ok) expect(over.error).toMatch(/cannot exceed the 3 keys/)
    const half = validateThreshold(1.5, 3)
    if (!half.ok) expect(half.error).toMatch(/whole number/)
    const empty = validateThreshold(1, 0)
    if (!empty.ok) expect(empty.error).toMatch(/at least one signer/)
  })
})

describe('thresholdHelper — the sentence under the field', () => {
  it('says what m of n means in practice', () => {
    expect(thresholdHelper(1, 2)).toBe('1 of 2 — either signer can act alone.')
    expect(thresholdHelper(2, 2)).toBe('2 of 2 — every signer must sign every transaction.')
    expect(thresholdHelper(2, 3)).toBe('2 of 3 — any 2 of the 3 signers can act together.')
    expect(thresholdHelper(1, 1)).toBe('1 of 1 — that single signer must sign every transaction.')
    expect(thresholdHelper(0, 3)).toMatch(/at least 1/)
    expect(thresholdHelper(2, 0)).toMatch(/Add a signer key first/)
  })
})

describe('validateMemo', () => {
  it('trims, allows empty, refuses over 100 characters and control characters', () => {
    expect(validateMemo('  hello ')).toEqual({ ok: true, value: 'hello' })
    expect(validateMemo('')).toEqual({ ok: true, value: '' })
    const long = validateMemo('x'.repeat(101))
    if (!long.ok) expect(long.error).toMatch(/101 characters; the limit is 100/)
    const control = validateMemo(`bad${String.fromCharCode(1)}memo`)
    expect(control.ok).toBe(false)
    if (!control.ok) expect(control.error).toMatch(/control characters/)
  })
})

describe('validateExpiryMinutes', () => {
  it('accepts 1 minute up to the 62-day protocol maximum', () => {
    expect(validateExpiryMinutes(30)).toEqual({ ok: true, value: 30 })
    expect(validateExpiryMinutes(62 * 24 * 60)).toEqual({ ok: true, value: 62 * 24 * 60 })
    const none = validateExpiryMinutes(0)
    if (!none.ok) expect(none.error).toMatch(/at least a minute/)
    const beyond = validateExpiryMinutes(62 * 24 * 60 + 1)
    expect(beyond.ok).toBe(false)
    if (!beyond.ok) expect(beyond.error).toMatch(/62 days at most/)
    const half = validateExpiryMinutes(1.5)
    if (!half.ok) expect(half.error).toMatch(/whole number/)
  })
})

describe('buildAccountCreatePlan', () => {
  it('builds the plan for 2 of 3, mixed curves, balance and memo', async () => {
    const keys = [await edSigner('Alice'), await edSigner('Bob'), ecdsaSigner('Carol')]
    const built = buildAccountCreatePlan(keys, 2, 'Community letter treasury', '10', '2', 'testnet')
    expect(built.ok).toBe(true)
    if (built.ok) {
      expect(built.plan.threshold).toBe(2)
      expect(built.plan.keyDers).toEqual(keys.map((key) => key.der))
      expect(built.plan.keyCurves).toEqual(['ed25519', 'ed25519', 'ecdsa'])
      expect(built.plan.initialBalanceTinybars).toBe('1000000000')
      expect(built.plan.maxFeeTinybars).toBe('200000000')
      expect(built.plan.memo).toBe('Community letter treasury')
      expect(built.plan.receiverSignatureRequired).toBe(false)
      expect(built.plan.network).toBe('testnet')
    }
  })

  it('collects every error at once — one submit, complete feedback', async () => {
    const built = buildAccountCreatePlan([await edSigner('only')], 5, 'x'.repeat(101), '-1')
    expect(built.ok).toBe(false)
    if (!built.ok) {
      expect(built.errors.length).toBeGreaterThanOrEqual(3)
      expect(built.errors.join('\n')).toMatch(/threshold cannot exceed/)
      expect(built.errors.join('\n')).toMatch(/101 characters/)
      expect(built.errors.join('\n')).toMatch(/Initial balance/)
    }
    const empty = buildAccountCreatePlan([], 1, '', '0')
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.errors.join('\n')).toMatch(/at least one signer key/)
  })

  it('refuses more than ten keys and a malformed DER', async () => {
    const many: SignerKey[] = []
    for (let i = 0; i < 11; i += 1) many.push(await edSigner(`s${i}`))
    expect(buildAccountCreatePlan(many, 1, '', '0').ok).toBe(false)

    const broken: SignerKey = { id: 'x', label: 'bad', der: '302a300506032b6570032100' + 'cd'.repeat(31), raw: '', curve: 'ed25519' }
    const built = buildAccountCreatePlan([broken], 1, '', '0')
    expect(built.ok).toBe(false)
    if (!built.ok) expect(built.errors.join('\n')).toMatch(/not a DER public key/)
  })

  it('keeps 1 of N as an explicit threshold key (threshold 1, not a bare key)', async () => {
    const built = buildAccountCreatePlan([await edSigner('solo')], 1, '', '0')
    expect(built.ok).toBe(true)
    if (built.ok) expect(built.plan.threshold).toBe(1)
  })

  it('the key shape of a plan survives the protobuf round-trip the wallet signs', async () => {
    const keys = [await edSigner('Alice'), ecdsaSigner('Bob')]
    const built = buildAccountCreatePlan(keys, 1, 'rt', '0')
    expect(built.ok).toBe(true)
    if (!built.ok) return

    const keyToProto = (der: string) =>
      der.startsWith('302a')
        ? proto.Key.create({ ed25519: new Uint8Array(Buffer.from(der.slice(44), 'hex')) })
        : proto.Key.create({ ECDSASecp256k1: new Uint8Array(Buffer.from(der.slice(44), 'hex')) })

    const transaction = proto.TransactionBody.create({
      memo: 'rt',
      cryptoCreateAccount: proto.CryptoCreateTransactionBody.create({
        key: proto.Key.create({
          thresholdKey: proto.ThresholdKey.create({
            threshold: 1,
            keys: proto.KeyList.create({ keys: built.plan.keyDers.map(keyToProto) }),
          }),
        }),
      }),
    })
    const decoded = proto.TransactionBody.decode(proto.TransactionBody.encode(transaction).finish())
    const create = decoded.cryptoCreateAccount!
    expect(create.key!.thresholdKey!.threshold).toBe(1)
    expect(create.key!.thresholdKey!.keys!.keys).toHaveLength(2)
    expect(Buffer.from(create.key!.thresholdKey!.keys!.keys![0]!.ed25519!).toString('hex')).toBe(
      built.plan.keyDers[0]!.slice(44),
    )
    expect(Buffer.from(create.key!.thresholdKey!.keys!.keys![1]!.ECDSASecp256k1!).toString('hex')).toBe(
      built.plan.keyDers[1]!.slice(44),
    )
  })
})

describe('buildTransferPlan', () => {
  it('builds the 1-of-N direct transfer plan', () => {
    const built = buildTransferPlan('mainnet', '0.0.4486', '0.0.51', '5.1', 'thanks')
    expect(built.ok).toBe(true)
    if (built.ok) {
      expect(built.plan.kind).toBe('transfer')
      expect(built.plan.treasuryAccountId).toBe('0.0.4486')
      expect(built.plan.recipientAccountId).toBe('0.0.51')
      expect(built.plan.amountTinybars).toBe('510000000')
      expect(built.plan.memo).toBe('thanks')
      expect(built.plan.maxFeeTinybars).toBe('200000000')
    }
  })

  it('refuses a malformed recipient, a zero amount, and the treasury paying itself', () => {
    expect(buildTransferPlan('mainnet', '0.0.4486', '0.0.x', '1', '').ok).toBe(false)
    expect(buildTransferPlan('mainnet', '0.0.4486', '0.0.51', '0', '').ok).toBe(false)
    const self = buildTransferPlan('mainnet', '0.0.4486', '0.0.4486', '1', '')
    expect(self.ok).toBe(false)
    if (!self.ok) expect(self.errors.join('\n')).toMatch(/treasury itself/)
  })
})

describe('buildSchedulePlan', () => {
  it('builds the M-of-N schedule plan and names the memo after the recipient', () => {
    const built = buildSchedulePlan('mainnet', '0.0.4486', '0.0.51', '9', '', 30)
    expect(built.ok).toBe(true)
    if (built.ok) {
      expect(built.plan.kind).toBe('scheduleCreate')
      expect(built.plan.amountTinybars).toBe('900000000')
      expect(built.plan.expiryMinutes).toBe(30)
      expect(built.plan.memo).toBe(defaultScheduleMemo('0.0.51'))
    }
  })

  it('keeps an explicit memo when the signer typed one', () => {
    const built = buildSchedulePlan('mainnet', '0.0.4486', '0.0.51', '1', 'rent for March', 1440)
    expect(built.ok && built.plan.memo).toBe('rent for March')
  })

  it('refuses an expiry outside the protocol window', () => {
    expect(buildSchedulePlan('mainnet', '0.0.4486', '0.0.51', '1', '', 0).ok).toBe(false)
    expect(buildSchedulePlan('mainnet', '0.0.4486', '0.0.51', '1', '', 62 * 24 * 60 + 1).ok).toBe(false)
  })
})

describe('formatHbar', () => {
  it('renders 8-decimal precision, trimming trailing zeros', () => {
    expect(formatHbar('0')).toBe('0 HBAR')
    expect(formatHbar('100000000')).toBe('1 HBAR')
    expect(formatHbar('123456789')).toBe('1.23456789 HBAR')
    expect(formatHbar('100001000')).toBe('1.00001 HBAR')
  })

  it('keeps the sign on outflows', () => {
    expect(formatHbar('-100000000')).toBe('−1 HBAR')
    expect(formatHbar('-125000000')).toBe('−1.25 HBAR')
  })

  it('is exact for large balances — no float drift', () => {
    expect(formatHbar(1148873401242n)).toBe('11488.73401242 HBAR')
  })
})

describe('derFromRaw round-trip', () => {
  it('wraps a raw key so parseSignerKey accepts it back', () => {
    const pub = PrivateKey.generateECDSA().publicKey
    const reparsed = parseSignerKey(derFromRaw('ecdsa', pub.toStringRaw().toLowerCase()))
    expect(reparsed.ok).toBe(true)
    if (reparsed.ok) expect(reparsed.key.toStringRaw()).toBe(pub.toStringRaw())
  })
})
