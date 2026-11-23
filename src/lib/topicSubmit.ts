import { config } from '../config'
import { waitForAnyTransaction } from './mirror'
import type { TopicCreatePlan } from './topic'
import { describeSubmitError, getConnector, getSdkAndShared, sessionOf, WalletError } from './wallet'

/** How long a wallet may stay silent before the mirror is asked instead. */
const WALLET_ANSWER_TIMEOUT_MS = 90_000

export interface TopicSubmitStages {
  submitting?: () => void
  awaitingReceipt?: () => void
}

export type TopicSubmitOutcome =
  | { kind: 'succeeded'; transactionId: string; status: string; topicId: string }
  | { kind: 'failed'; transactionId: string; status: string }
  | { kind: 'unverified'; transactionId: string }

/**
 * Create the topic the plan describes.
 *
 * The transaction is frozen here, so the wallet signs exactly the bytes this
 * page built: the treasury's key list as the admin key, the memo, and the fee
 * cap. The wallet pays; the treasury ends up owning the topic.
 *
 * The network's answer is read back from the mirror rather than trusted from
 * the wallet, and the row is matched without a name filter — the mirror's name
 * for this transaction is its business, the entity id is what matters here.
 */
export async function createTopic(
  plan: TopicCreatePlan,
  stages: TopicSubmitStages = {},
): Promise<TopicSubmitOutcome> {
  if (plan.network !== config.network) {
    throw new WalletError(
      'wrong_network',
      `This build is set to ${config.network}, but the plan names ${plan.network}. Aborted before submitting.`,
    )
  }

  const connector = await getConnector()
  const session = sessionOf(connector)
  if (!session) throw new WalletError('no_account', 'Connect a wallet first.')
  if (session.network !== config.network) {
    throw new WalletError(
      'wrong_network',
      `The wallet session is on ${session.network}, not ${config.network}. Aborted before submitting.`,
    )
  }

  const { shared, sdk } = await getSdkAndShared()

  const keyList = new sdk.KeyList(
    plan.adminKey.keys.map((key) => sdk.PublicKey.fromString(key.der)),
  )
  keyList.setThreshold(plan.adminKey.threshold)

  const transaction = new sdk.TopicCreateTransaction()
    .setTopicMemo(plan.memo)
    .setAdminKey(keyList)
    .setMaxTransactionFee(sdk.Hbar.fromTinybars(plan.maxFeeTinybars))
    .setTransactionId(sdk.TransactionId.generate(sdk.AccountId.fromString(session.accountId)))

  transaction.freezeWith(sdk.Client.forName(plan.network))

  const transactionId = transaction.transactionId?.toString() ?? ''
  if (!transactionId) {
    throw new WalletError('unknown', 'The frozen transaction has no id — cannot verify what was submitted.')
  }

  stages.submitting?.()
  let walletError: unknown
  const walletCall = connector
    .signAndExecuteTransaction({
      signerAccountId: `${config.profile.chainId}:${session.accountId}`,
      transactionList: shared.transactionToBase64String(transaction),
    })
    .catch((error: unknown) => {
      walletError = error
    })
  await Promise.race([
    walletCall,
    new Promise<void>((resolve) => setTimeout(resolve, WALLET_ANSWER_TIMEOUT_MS)),
  ])
  if (walletError !== undefined) {
    if (walletError instanceof WalletError) throw walletError
    throw new WalletError('unknown', describeSubmitError(walletError))
  }

  stages.awaitingReceipt?.()
  const receipt = await waitForAnyTransaction(config.network, transactionId)
  if (!receipt) return { kind: 'unverified', transactionId }
  if (receipt.result !== 'SUCCESS') {
    return { kind: 'failed', transactionId, status: receipt.result }
  }
  if (!receipt.entityId) {
    return { kind: 'unverified', transactionId }
  }
  return {
    kind: 'succeeded',
    transactionId,
    status: receipt.result,
    topicId: receipt.entityId,
  }
}
