import { config } from '../config'
import { waitForTransaction } from './mirror'
import type { AccountUpdatePlan } from './treasury'
import { publicKeyFromPlanKey } from './create'
import { getConnector, getSdkAndShared, sessionOf, describeSubmitError, WalletError } from './wallet'

type SdkModule = typeof import('@hiero-ledger/sdk')

/**
 * The only file that builds an AccountUpdateTransaction.
 *
 * The plan (`lib/treasury.ts`) decided every parameter in plain data, under
 * test; this turns it into the bytes the connected wallet signs. The wallet
 * is the payer, and its key — one of the treasury's CURRENT keys — is the
 * signature the update needs. At m-of-n the network wants m signatures at
 * once, which a single wallet session cannot supply; the panel refuses to
 * offer it rather than half-submit.
 */
export type UpdateOutcome =
  | { kind: 'updated'; transactionId: string; status: string; consensusTimestamp: string }
  /** the network said no: `status` is the receipt word, verbatim */
  | { kind: 'failed'; transactionId: string; status: string }
  /** the wallet answered; the mirror could not be read — verify on HashScan */
  | { kind: 'unverified'; transactionId: string }

export interface UpdateStages {
  submitting?: () => void
  awaitingReceipt?: () => void
}

export async function updateTreasuryKey(
  plan: AccountUpdatePlan,
  stages: UpdateStages = {},
): Promise<UpdateOutcome> {
  if (plan.network !== config.network) {
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

  const signerKeys = plan.keyDers.map((der, index) =>
    publicKeyFromPlanKey(sdk as SdkModule, plan.keyCurves[index] ?? 'ed25519', der),
  )
  const thresholdKey = new sdk.KeyList(signerKeys, plan.threshold)

  const transaction = new sdk.AccountUpdateTransaction()
    .setAccountId(sdk.AccountId.fromString(plan.accountId))
    .setKey(thresholdKey)
    .setMaxTransactionFee(sdk.Hbar.fromTinybars(plan.maxFeeTinybars))
    .setTransactionId(sdk.TransactionId.generate(sdk.AccountId.fromString(session.accountId)))

  // Frozen here on purpose: the wallet executes exactly these bytes, and the
  // transaction id the receipt read-back is keyed on exists before signing.
  transaction.freezeWith(sdk.Client.forName(plan.network))
  const txId = transaction.transactionId
  if (!txId) {
    throw new WalletError('unknown', 'The frozen transaction has no id. Aborted before submitting.')
  }
  const transactionId = txId.toString()

  stages.submitting?.()
  await connector
    .signAndExecuteTransaction({
      signerAccountId: `${config.profile.chainId}:${session.accountId}`,
      transactionList: shared.transactionToBase64String(transaction),
    })
    .catch((error: unknown) => {
      if (error instanceof WalletError) throw error
      throw new WalletError('unknown', describeSubmitError(error))
    })

  stages.awaitingReceipt?.()
  const receipt = await waitForTransaction(plan.network, transactionId, ['CRYPTOUPDATEACCOUNT'])

  if (receipt && receipt.result !== 'SUCCESS') {
    return { kind: 'failed', transactionId, status: receipt.result }
  }
  if (receipt && receipt.result === 'SUCCESS') {
    return {
      kind: 'updated',
      transactionId,
      status: receipt.result,
      consensusTimestamp: receipt.consensusTimestamp,
    }
  }
  return { kind: 'unverified', transactionId }
}
