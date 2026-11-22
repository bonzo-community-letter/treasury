import { StepHeading } from './StepUi'

/** What happens after the ceremony: who needs which of the two kept values. */
export function DoneStep() {
  return (
    <div>
      <StepHeading title="What now?" />

      <dl className="space-y-6">
        <div>
          <dt className="eyebrow-sheet">The public key (302a…)</dt>
          <dd className="mt-2 max-w-[58ch] text-[0.9375rem] leading-relaxed text-sheet-ink">
            It goes to the coordinator. From the two public keys they open the treasury
            account on Hedera mainnet — a regular account with a key threshold of 1 of 2,
            two people, one key each. This website creates no account; that is a step of
            its own, run locally by the coordinator.
          </dd>
        </div>
        <div>
          <dt className="eyebrow-sheet">Your key — when a transaction is due</dt>
          <dd className="mt-2 max-w-[58ch] text-[0.9375rem] leading-relaxed text-sheet-ink">
            Import it in HashPack with the phrase, not with a copied key: “I already have a
            wallet” → import the recovery phrase → enter the treasury account ID. HashPack
            derives the private key from the words itself, on your device. Not today —
            only when the account exists.
          </dd>
        </div>
        <div>
          <dt className="eyebrow-sheet">The 24 words</dt>
          <dd className="mt-2 max-w-[58ch] text-[0.9375rem] leading-relaxed text-sheet-ink">
            Your only secret. Whoever holds the phrase holds the key — treat the paper
            exactly like the private key itself.
          </dd>
        </div>
        <div>
          <dt className="eyebrow-sheet">Where things live</dt>
          <dd className="mt-2 max-w-[58ch] text-[0.9375rem] leading-relaxed text-sheet-ink">
            The phrase wants paper or a password manager — and a place no backup script
            reaches. A backup everyone can find is not a backup. The public key file may
            stay digital; it holds nothing secret.
          </dd>
        </div>
      </dl>

      <p className="mt-10 border-t border-sheet-rule pt-6 text-sm leading-relaxed text-sheet-ink-soft">
        When this window closes, what the page produced disappears. What you wrote down
        stays.
      </p>
    </div>
  )
}
