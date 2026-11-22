import { describe, expect, it } from 'vitest'
import { proto } from '@hiero-ledger/proto'
import Long from 'long'
import {
  decodeScheduledBody,
  hasKeySigned,
  keyOf,
  scheduleStatus,
  scheduleView,
  scheduledOutflow,
  treasurySchedules,
} from './schedule'
import { treasuryKey, type TreasuryKeyStructure } from './accountKey'
import type { MirrorSchedule } from './mirror'

/**
 * The scheduled cryptoTransfer of live schedule… body (mainnet, fetched from
 * /api/v1/schedules during development): 0.0.10964347 receives 9 HBAR,
 * 0.0.10964350 pays. Baked in so the decoder faces real network bytes,
 * including the negative (debit) protobuf long.
 */
const LIVE_BODY_BASE64 = 'CIDC1y9KIAoeCg0KBRj7mp0FEICkp9oGCg0KBRj+mp0FEP+jp9oG'

/** The live public_key_prefix of schedule 0.0.10964595's creator — base64
 *  of that account's full raw ECDSA public key. */
const LIVE_SIGNATURE_PREFIX = 'A4M5aXA2XS3sSRIPswgMqLjkj+qThWsP8o9JNW+wwl85'
const LIVE_SIGNATURE_RAW = '0383396970365d2dec49120fb3080ca8b8e48fea93856b0ff28f49356fb0c25f39'

function bodyBase64(legs: ReadonlyArray<{ account: string; amount: bigint }>): string {
  const body = proto.SchedulableTransactionBody.create({
    cryptoTransfer: {
      transfers: {
        accountAmounts: legs.map((leg) => {
          const [shard, realm, num] = leg.account.split('.')
          return {
            accountID: {
              shardNum: Long.fromValue(Number(shard)),
              realmNum: Long.fromValue(Number(realm)),
              accountNum: Long.fromValue(Number(num)),
            },
            amount: Long.fromValue(leg.amount),
          }
        }),
      },
    },
    memo: '',
  })
  return Buffer.from(proto.SchedulableTransactionBody.encode(body).finish()).toString('base64')
}

function makeSchedule(overrides: Partial<MirrorSchedule> = {}): MirrorSchedule {
  return {
    scheduleId: '0.0.9001',
    creatorAccountId: '0.0.4486',
    payerAccountId: '0.0.4486',
    executedTimestamp: null,
    expirationTime: '1795539896.000000000',
    deleted: false,
    memo: 'test schedule',
    transactionBody: bodyBase64([
      { account: '0.0.4486', amount: -500_000_000n },
      { account: '0.0.51', amount: 500_000_000n },
    ]),
    signatures: [],
    ...overrides,
  }
}

const keyA = treasuryKey('ed25519', new Uint8Array(32).fill(0xaa))
const keyB = treasuryKey('ed25519', new Uint8Array(32).fill(0xbb))
const structure: TreasuryKeyStructure = { threshold: 2, keys: [keyA, keyB] }

describe('decodeScheduledBody — the live mainnet body', () => {
  it('reads both legs, including the negative debit', () => {
    const body = decodeScheduledBody(LIVE_BODY_BASE64)
    expect(body.kind).toBe('transfer')
    if (body.kind !== 'transfer') return
    expect(body.legs).toHaveLength(2)
    expect(body.legs).toContainEqual({ account: '0.0.10964347', amount: 900_000_000n })
    expect(body.legs).toContainEqual({ account: '0.0.10964350', amount: -900_000_000n })
  })

  it('attributes the outflow to the paying treasury', () => {
    const out = scheduledOutflow(decodeScheduledBody(LIVE_BODY_BASE64), '0.0.10964350')
    expect(out).toEqual({ recipient: '0.0.10964347', amountOutTinybars: 900_000_000n })
  })
})

describe('decodeScheduledBody / scheduledOutflow', () => {
  it('a body that is not a transfer is simply other', () => {
    expect(decodeScheduledBody(null).kind).toBe('other')
    expect(decodeScheduledBody('not base64 protobuf at all!!').kind).toBe('other')
    const other = proto.SchedulableTransactionBody.create({ memo: 'not a transfer' })
    const encoded = Buffer.from(proto.SchedulableTransactionBody.encode(other).finish()).toString('base64')
    expect(decodeScheduledBody(encoded).kind).toBe('other')
  })

  it('the treasury as the CREDIT is not this treasury spending', () => {
    const body = decodeScheduledBody(
      bodyBase64([
        { account: '0.0.4486', amount: 500_000_000n },
        { account: '0.0.51', amount: -500_000_000n },
      ]),
    )
    expect(scheduledOutflow(body, '0.0.4486')).toBeNull()
  })

  it('multi-recipient bodies are not shown as one recipient', () => {
    const body = decodeScheduledBody(
      bodyBase64([
        { account: '0.0.4486', amount: -500_000_000n },
        { account: '0.0.51', amount: 300_000_000n },
        { account: '0.0.52', amount: 200_000_000n },
      ]),
    )
    expect(scheduledOutflow(body, '0.0.4486')).toBeNull()
  })

  it('treasurySchedules keeps only treasury-debiting bodies', () => {
    const mine = makeSchedule()
    const theirs = makeSchedule({ scheduleId: '0.0.9002', transactionBody: bodyBase64([{ account: '0.0.777', amount: -1n }, { account: '0.0.51', amount: 1n }]) })
    const junk = makeSchedule({ scheduleId: '0.0.9003', transactionBody: null })
    expect(treasurySchedules([mine, theirs, junk], '0.0.4486').map((s) => s.scheduleId)).toEqual(['0.0.9001'])
  })
})

describe('scheduleStatus', () => {
  const now = 1_795_539_000
  it('pending while there is time left', () => {
    expect(scheduleStatus(makeSchedule(), now)).toBe('pending')
  })
  it('executed once the network ran it', () => {
    expect(scheduleStatus(makeSchedule({ executedTimestamp: '1795539100.1' }), now)).toBe('executed')
  })
  it('expired past its expiry, unsigned', () => {
    expect(scheduleStatus(makeSchedule({ expirationTime: '1795538000.0' }), now)).toBe('expired')
  })
  it('cancelled wins over everything — deleted is deletion', () => {
    expect(scheduleStatus(makeSchedule({ deleted: true, executedTimestamp: '1795539100.1' }), now)).toBe('cancelled')
    expect(scheduleStatus(makeSchedule({ deleted: true }), now)).toBe('cancelled')
  })
})

describe('scheduleView — signatures, thresholds and the Sign button', () => {
  const schedule = makeSchedule({
    signatures: [{ consensusTimestamp: '1795539050.1', publicKeyPrefix: keyA.base64 }],
  })

  it('builds the 1 of 2 picture from mirror data alone', () => {
    const view = scheduleView(schedule, '0.0.4486', structure, 1_795_539_000)
    expect(view).not.toBeNull()
    if (!view) return
    expect(view.status).toBe('pending')
    expect(view.collected).toBe(1)
    expect(view.threshold).toBe(2)
    expect(view.transfer).toEqual({ recipient: '0.0.51', amountOutTinybars: 500_000_000n })
    expect(view.signers.map((s) => s.signed)).toEqual([true, false])
    expect(view.expirySec).toBe(1_795_539_896)
  })

  it('hasKeySigned drives the button for the connected signer', () => {
    const view = scheduleView(schedule, '0.0.4486', structure, 1_795_539_000)
    if (!view) throw new Error('view missing')
    expect(hasKeySigned(view, keyA.raw)).toBe(true)
    expect(hasKeySigned(view, keyB.raw)).toBe(false)
    expect(hasKeySigned(view, null)).toBe(false)
    expect(keyOf(structure, keyB.raw.toUpperCase())?.raw).toBe(keyB.raw)
  })

  it('a live signature prefix matches the live raw key it was derived from', () => {
    const liveKey = treasuryKey('ecdsa', new Uint8Array(Buffer.from(LIVE_SIGNATURE_RAW, 'hex')))
    expect(liveKey.base64).toBe(LIVE_SIGNATURE_PREFIX)
    const liveStructure: TreasuryKeyStructure = { threshold: 2, keys: [liveKey] }
    const view = scheduleView(
      makeSchedule({
        payerAccountId: '0.0.10964350',
        transactionBody: decodeScheduledBody(LIVE_BODY_BASE64).kind === 'transfer' ? LIVE_BODY_BASE64 : null,
        signatures: [{ consensusTimestamp: '', publicKeyPrefix: LIVE_SIGNATURE_PREFIX }],
      }),
      '0.0.10964350',
      liveStructure,
      1_795_000_000,
    )
    expect(view?.signers[0]?.signed).toBe(true)
    expect(view?.collected).toBe(1)
  })

  it('a schedule that does not debit this treasury gets no view', () => {
    expect(scheduleView(makeSchedule(), '0.0.9999', structure, 1_795_539_000)).toBeNull()
  })
})
