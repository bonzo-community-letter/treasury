import { config } from '../config'
import type { SchedulePlan, TransferPlan } from './treasury'
import { waitForTransaction, type MirrorTransactionRow } from './mirror'
import { describeSubmitError, getConnector, getSdkAndShared, sessionOf, WalletError } from './wallet'

type SdkModule = typeof import('@hiero-ledger/sdk')

/**
 * The only file in the app that builds transfers — direct and scheduled.
 *
 * Like `lib/create.ts`, everything here translates a validated plan into the
 * exact bytes the connected wallet signs and pays for; nothing here decides
 * an amount, a recipient, or a fee.
 *
 * The 1-of-N path is a normal CryptoTransfer: the connected signer's wallet
 * pays the fee and its key satisfies the treasury's threshold in one
 * signature.
 *
 * The M-of-N path wraps the same transfer in a ScheduleCreate. Two
 * deliberate omissions, both required by how the network checks schedules:
 *
 *   - the inner transfer gets NO transaction id: the network assigns one at
 *     execution, and leaving it default makes the inner fee payer the
 *     ScheduleCreate creator — which is what keeps the ScheduleCreate
 *     signable by one wallet (the network requires the inner fee payer's
 *     signature on the ScheduleCreate itself);
 *   - the inner transfer is never frozen: the SDK serializes it as a
 *     SchedulableTransactionBody from its fields alone.
 *
 * Other signers add their keys via ScheduleSign; the threshold is met when
 * the network says so, read back from the mirror — never assumed here.
 */

export interface SubmitStages {
  /** the wallet is showing its approval prompt */
  submitting?: () => void
  /** the wallet answered; the receipt is being read back */
  awaitingReceipt?: () => void
}

export type SubmitOutcome =
  | { kind: 'succeeded'; transactionId: string; status: string; entityId: string | null; consensusTimestamp: string }
  /** the network said no: `status` is the receipt word, verbatim */
  | { kind: 'failed'; transactionId: string; status: string }
  /** the wallet answered; the mirror could not be read — verify on HashScan */
  | { kind: 'unverified'; transactionId: string }

interface WalletAnswer {
  transactionId: string
  outcome: SubmitOutcome
}

/**
 * The shared path: freeze here, hand the wallet exactly these bytes, then
 * read the network's verdict back from the mirror. `expectNames` are the
 * transaction names that count as the receipt for this call.
 */
async function submitThroughWallet(
  build: (sdk: SdkModule, sessionAccount: string) => import('@hiero-ledger/sdk').Transaction,
  expectNames: readonly string[],
  stages: SubmitStages,
): Promise<WalletAnswer> {
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
  const transaction = build(sdk, session.accountId)

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

  const txId = transaction.transactionId
  const transactionId = txId ? txId.toString() : ''
  if (!transactionId) {
    throw new WalletError('unknown', 'The frozen transaction has no id — cannot verify what was submitted.')
  }

  stages.awaitingReceipt?.()
  // HIP-820: the wallet only answers once the transaction was executed and a
  // receipt read. The status word itself comes from the mirror node.
  const receipt = await waitForTransaction(config.network, transactionId, expectNames)

  if (!receipt) return { transactionId, outcome: { kind: 'unverified', transactionId } }
  if (receipt.result !== 'SUCCESS') {
    return { transactionId, outcome: { kind: 'failed', transactionId, status: receipt.result } }
  }
  return {
    transactionId,
    outcome: {
      kind: 'succeeded',
      transactionId,
      status: receipt.result,
      entityId: receipt.entityId,
      consensusTimestamp: receipt.consensusTimestamp,
    },
  }
}

function assertPlanNetwork(plan: { network: string }): void {
  if (plan.network !== config.network) {
    throw new WalletError(
      'wrong_network',
      `This build is set to ${config.network}, but the plan names ${plan.network}. Aborted before submitting.`,
    )
  }
}

/**
 * Layer 3b (A) — 1-of-N treasury: a normal CryptoTransfer.
 * The connected wallet pays the fee; the treasury is debited by amount.
 */
export async function executeTransfer(plan: TransferPlan, stages: SubmitStages = {}): Promise<SubmitOutcome> {
  assertPlanNetwork(plan)
  const { outcome } = await submitThroughWallet((sdk, sessionAccount) => {
    const transaction = new sdk.TransferTransaction()
      .addHbarTransfer(sdk.AccountId.fromString(plan.treasuryAccountId), sdk.Hbar.fromTinybars(plan.amountTinybars).negated())
      .addHbarTransfer(sdk.AccountId.fromString(plan.recipientAccountId), sdk.Hbar.fromTinybars(plan.amountTinybars))
      .setMaxTransactionFee(sdk.Hbar.fromTinybars(plan.maxFeeTinybars))
      .setTransactionId(sdk.TransactionId.generate(sdk.AccountId.fromString(sessionAccount)))
    if (plan.memo.length > 0) transaction.setTransactionMemo(plan.memo)
    transaction.freezeWith(sdk.Client.forName(plan.network))
    return transaction
  }, ['CRYPTOTRANSFER'], stages)
  return outcome
}

export type ScheduleSubmitOutcome = SubmitOutcome & {
  /** the schedule entity id — from the mirror's SCHEDULECREATE row */
  scheduleId: string | null
}

/**
 * Layer 3b (B) — M-of-N treasury: wrap the transfer in a ScheduleCreate and
 * let the other signatures arrive via ScheduleSign before expiry.
 */
export async function createScheduledTransfer(
  plan: SchedulePlan,
  stages: SubmitStages = {},
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<ScheduleSubmitOutcome> {
  assertPlanNetwork(plan)
  const { outcome } = await submitThroughWallet((sdk, sessionAccount) => {
    // The inner transfer: unfrozen, no transaction id — see header note.
    const inner = new sdk.TransferTransaction()
      .addHbarTransfer(sdk.AccountId.fromString(plan.treasuryAccountId), sdk.Hbar.fromTinybars(plan.amountTinybars).negated())
      .addHbarTransfer(sdk.AccountId.fromString(plan.recipientAccountId), sdk.Hbar.fromTinybars(plan.amountTinybars))
    if (plan.memo.length > 0) inner.setTransactionMemo(plan.memo)

    const schedule = new sdk.ScheduleCreateTransaction()
      .setScheduledTransaction(inner)
      .setScheduleMemo(plan.memo)
      .setExpirationTime(sdk.Timestamp.fromDate(new Date((nowSec + plan.expiryMinutes * 60) * 1000)))
      .setMaxTransactionFee(sdk.Hbar.fromTinybars(plan.maxFeeTinybars))
      .setTransactionId(sdk.TransactionId.generate(sdk.AccountId.fromString(sessionAccount)))
    schedule.freezeWith(sdk.Client.forName(plan.network))
    return schedule
  }, ['SCHEDULECREATE'], stages)

  const scheduleId = outcome.kind === 'succeeded' ? outcome.entityId : null
  return { ...outcome, scheduleId }
}

/**
 * One treasury signer adds their key to a pending schedule. The wallet pays
 * the small ScheduleSign fee; only the network counts the signature.
 */
export async function signSchedule(scheduleId: string, stages: SubmitStages = {}): Promise<SubmitOutcome> {
  const { outcome } = await submitThroughWallet((sdk, sessionAccount) => {
    const transaction = new sdk.ScheduleSignTransaction()
      .setScheduleId(sdk.ScheduleId.fromString(scheduleId))
      .setMaxTransactionFee(sdk.Hbar.fromTinybars('2'))
      .setTransactionId(sdk.TransactionId.generate(sdk.AccountId.fromString(sessionAccount)))
    transaction.freezeWith(sdk.Client.forName(config.network))
    return transaction
  }, ['SCHEDULESIGN'], stages)
  return outcome
}

/** The mirror row shape re-exported for the UI's status lines. */
export type ReceiptRow = MirrorTransactionRow
