import { config } from '../config'
import type { HederaNetwork } from './hedera'
import { waitForCryptoCreate } from './mirror'
import type { AccountCreatePlan } from './treasury'
import { getConnector, getSdkAndShared, sessionOf, describeSubmitError, WalletError } from './wallet'

type SdkModule = typeof import('@hiero-ledger/sdk')

/**
 * The only file in the app that builds an AccountCreateTransaction.
 *
 * The plan (`lib/treasury.ts`) already decided every parameter, in plain
 * data, under test. Everything here is translation: plan → protobuf → the
 * single JSON-RPC call the connected wallet answers. The wallet signs and
 * pays — this module never sees a private key, and the transaction the wallet
 * executes is exactly the bytes frozen here, transaction id included.
 *
 * On the key: the current SDK no longer ships a `ThresholdKey` class. The
 * m-of-n key is a `KeyList` that carries a threshold; serialized it is the
 * protobuf `Key.thresholdKey{threshold, keyList}` HashPack shows as a
 * threshold key. `new KeyList(keys, m)` is the current spelling of
 * `ThresholdKey.withThreshold(m).of(...keys)`. It is used even at 1 of N:
 * the treasury's shape on chain never depends on how many keys it started
 * with.
 */

export interface CreatedAccount {
  readonly network: HederaNetwork
  readonly accountId: string
  readonly transactionId: string
  /** the network's own word, taken from the mirror receipt */
  readonly status: string
  readonly consensusTimestamp: string
}

export type CreateOutcome =
  | { kind: 'created'; account: CreatedAccount }
  /** the network said no: `status` is the receipt word, verbatim */
  | { kind: 'failed'; transactionId: string; status: string }
  /** the wallet answered; the mirror could not be read — verify on HashScan */
  | { kind: 'unverified'; transactionId: string; accountId: string | null }

export interface CreateStages {
  /** the wallet is showing its approval prompt */
  submitting?: () => void
  /** the wallet answered; the receipt is being read back */
  awaitingReceipt?: () => void
}

/** DER-plan key → SDK PublicKey, per curve. */
function publicKeyFromPlanKey(sdk: SdkModule, curve: 'ed25519' | 'ecdsa', der: string) {
  // The DER prefix was validated in `lib/keys.ts`; the raw bytes are what
  // follows it — 64 hex after `302a…`, 66 after `302d…`.
  const rawHex = der.startsWith('302a300506032b6570032100') ? der.slice(24) : der.slice(28)
  const bytes = new Uint8Array(rawHex.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(rawHex.slice(i * 2, i * 2 + 2), 16)
  }
  return curve === 'ed25519' ? sdk.PublicKey.fromBytesED25519(bytes) : sdk.PublicKey.fromBytesECDSA(bytes)
}

/**
 * Create the treasury account the plan describes.
 *
 * Throws `WalletError` (readable sentence in `message`) when the wallet is
 * not connected, is on the wrong network, or the user rejects in the wallet.
 * A transaction the network *rejected* is not a thrown error — it comes back
 * as `{ kind: 'failed', status }` so the UI can show the receipt word
 * verbatim.
 */
export async function createTreasuryAccount(
  plan: AccountCreatePlan,
  stages: CreateStages = {},
): Promise<CreateOutcome> {
  if (plan.network !== config.network) {
    // Cannot happen through the UI (one build, one network) — refuse anyway:
    // this is the one mistake no message can undo later.
    throw new WalletError(
      'wrong_network',
      `This build is set to ${config.network}, but the plan names ${plan.network}. Aborted before submitting.`,
    )
  }

  const connector = await getConnector()
  const session = sessionOf(connector)
  if (!session) throw new WalletError('no_account', 'Connect a wallet first.')
  if (session.network !== plan.network) {
    throw new WalletError(
      'wrong_network',
      `The wallet session is on ${session.network}, not ${plan.network}. Aborted before submitting.`,
    )
  }

  const { shared, sdk } = await getSdkAndShared()

  // The m-of-n key: a KeyList carrying the threshold (see header note).
  const signerKeys = plan.keyDers.map((der, index) => publicKeyFromPlanKey(sdk, plan.keyCurves[index] ?? 'ed25519', der))
  const thresholdKey = new sdk.KeyList(signerKeys, plan.threshold)

  const transaction = new sdk.AccountCreateTransaction()
    .setKey(thresholdKey)
    .setReceiverSignatureRequired(plan.receiverSignatureRequired)
    .setMaxTransactionFee(sdk.Hbar.fromTinybars(plan.maxFeeTinybars))
    .setTransactionId(sdk.TransactionId.generate(sdk.AccountId.fromString(session.accountId)))
  if (plan.memo.length > 0) transaction.setAccountMemo(plan.memo)
  if (plan.initialBalanceTinybars !== '0') {
    transaction.setInitialBalance(sdk.Hbar.fromTinybars(plan.initialBalanceTinybars))
  }

  // Freeze here on purpose: the wallet executes exactly the bytes it is given,
  // and the transaction id — which the receipt read-back is keyed on — is ours
  // before a signature exists.
  transaction.freezeWith(sdk.Client.forName(plan.network))
  const txId = transaction.transactionId
  if (!txId) {
    throw new WalletError('unknown', 'The frozen transaction has no id. Aborted before submitting.')
  }
  const transactionId = txId.toString()

  stages.submitting?.()
  const response = await connector
    .signAndExecuteTransaction({
      signerAccountId: `${config.profile.chainId}:${session.accountId}`,
      transactionList: shared.transactionToBase64String(transaction),
    })
    .catch((error: unknown) => {
      // Rejection and every transport failure arrive as readable sentences.
      if (error instanceof WalletError) throw error
      throw new WalletError('unknown', describeSubmitError(error))
    })

  stages.awaitingReceipt?.()

  const result = (response.result ?? {}) as { transactionId?: string; accountId?: string }
  const walletAccountId = typeof result.accountId === 'string' ? result.accountId : null

  // HIP-820: the wallet only answers once the transaction was executed and a
  // receipt read. The status word itself comes from the mirror node.
  const receipt = await waitForCryptoCreate(plan.network, transactionId)

  if (receipt && receipt.result !== 'SUCCESS') {
    return { kind: 'failed', transactionId, status: receipt.result }
  }

  const accountId = walletAccountId ?? receipt?.entityId ?? null
  if (receipt && receipt.result === 'SUCCESS' && accountId) {
    return {
      kind: 'created',
      account: {
        network: plan.network,
        accountId,
        transactionId,
        status: receipt.result,
        consensusTimestamp: receipt.consensusTimestamp,
      },
    }
  }

  // Wallet answered with a created account but the mirror never confirmed
  // (offline, lagging): say exactly that — never dress an unverified read
  // as a receipt.
  return { kind: 'unverified', transactionId, accountId }
}
