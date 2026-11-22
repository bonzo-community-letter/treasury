import type { TreasuryKeyStructure } from './accountKey'
import { structureHasRaw } from './accountKey'

/**
 * Who the connected wallet is, for THIS treasury — resolved from the chain,
 * never from a config list of signers:
 *
 *   admin   the configured admin account (the only payer of a treasury create)
 *   signer  the wallet's own account key (read back from the mirror) is one
 *           of the treasury account's key-list keys — or the session is the
 *           treasury account itself, acting through its own key
 *   visitor everyone else
 *
 * The decision is pure; `hooks/useRole.ts` supplies the inputs, the mirror
 * supplies the truth. UI gating on the result is cosmetic — the chain
 * enforces everything (only the admin's key can pay for a CryptoCreate, and
 * only treasury keys count as signatures).
 */

export type Role = 'admin' | 'signer' | 'visitor'

export interface RoleInput {
  readonly connectedAccountId: string | null
  /** the connected account's own on-chain key, raw hex; null if unreadable */
  readonly connectedKeyRaw: string | null
  readonly adminAccount: string
  readonly treasuryAccountId: string | null
  readonly structure: TreasuryKeyStructure | null
}

export function resolveRole(input: RoleInput): Role {
  if (!input.connectedAccountId) return 'visitor'
  if (input.connectedAccountId === input.adminAccount) return 'admin'
  if (input.treasuryAccountId && input.connectedAccountId === input.treasuryAccountId) return 'signer'
  if (structureHasRaw(input.structure, input.connectedKeyRaw)) return 'signer'
  return 'visitor'
}

/** The sentence the stats layer shows a connected non-key-holder. */
export const VISITOR_NOTE = 'This wallet holds no key for this treasury — the stats stay, the actions do not apply.'
