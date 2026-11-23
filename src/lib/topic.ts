import type { TreasuryKeyStructure } from './accountKey'
import type { HederaNetwork } from './hedera'
import { DEFAULT_MAX_FEE_HBAR, parseHbarAmount, type Validated } from './treasury'

/**
 * Creating a consensus topic that belongs to the treasury.
 *
 * Two separate questions, kept separate here:
 *
 *   - **who owns the topic** — the treasury's own key becomes the topic's
 *     admin key, so the treasury (its threshold, its signers) can update or
 *     delete it later. Nothing about the paying wallet ends up in the topic.
 *   - **who pays for it** — the wallet that signs this transaction, capped by
 *     the maximum fee below. That is the only thing the admin spends.
 *
 * The plan is a plain description: the SDK key list is built at submit time,
 * because the key objects are the SDK's, not this page's.
 */

/** The network's memo limit for a topic, in bytes. */
export const TOPIC_MEMO_MAX_BYTES = 100

export interface TopicAdminKey {
  readonly threshold: number
  /** DER-encoded public keys, in the order the treasury holds them. */
  readonly keys: readonly { der: string; curve: 'ed25519' | 'ecdsa' }[]
}

export interface TopicCreatePlan {
  readonly kind: 'topicCreate'
  readonly network: HederaNetwork
  readonly memo: string
  readonly adminKey: TopicAdminKey
  readonly maxFeeTinybars: string
}

export interface TopicCreateInput {
  network: HederaNetwork
  structure: TreasuryKeyStructure
  memo: string
  maxFeeHbar?: string
}

/** Byte length, because the limit is bytes and a memo may hold any script. */
export function topicMemoBytes(memo: string): number {
  return new TextEncoder().encode(memo).length
}

export function validateTopicMemo(memo: string): Validated<string> {
  const text = memo.trim()
  if (text.length === 0) return { ok: true, value: '' }
  const bytes = topicMemoBytes(text)
  if (bytes > TOPIC_MEMO_MAX_BYTES) {
    return { ok: false, error: `The memo is ${bytes} bytes; a topic memo allows ${TOPIC_MEMO_MAX_BYTES}.` }
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    return { ok: false, error: 'The memo contains control characters.' }
  }
  return { ok: true, value: text }
}

export function buildTopicCreatePlan(
  input: TopicCreateInput,
): { ok: true; plan: TopicCreatePlan } | { ok: false; errors: string[] } {
  const errors: string[] = []

  const memo = validateTopicMemo(input.memo)
  if (!memo.ok) errors.push(memo.error)

  const fee = parseHbarAmount(input.maxFeeHbar ?? DEFAULT_MAX_FEE_HBAR, 'Max fee')
  if (!fee.ok) errors.push(fee.error)

  const structure = input.structure
  if (structure.keys.length === 0) {
    errors.push('The treasury key has no keys to make an admin key from.')
  }
  if (structure.threshold < 1 || structure.threshold > structure.keys.length) {
    errors.push('The treasury threshold does not fit its key list.')
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    plan: {
      kind: 'topicCreate',
      network: input.network,
      memo: memo.ok ? memo.value : '',
      adminKey: {
        threshold: structure.threshold,
        keys: structure.keys.map((key) => ({ der: key.der, curve: key.curve })),
      },
      maxFeeTinybars: fee.ok ? fee.value : '0',
    },
  }
}
