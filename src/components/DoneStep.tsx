import { StepHeading } from './StepUi'

/** What happens after the ceremony: who needs which of the three values. */
export function DoneStep() {
  return (
    <div>
      <StepHeading title="What now?" />

      <dl className="space-y-6">
        <div>
          <dt className="eyebrow-sheet">The public key (302a…)</dt>
          <dd className="mt-2 max-w-[58ch] text-[0.9375rem] leading-relaxed text-sheet-ink">
            It goes to the coordinator. They use it to open the treasury account on Hedera
            mainnet — an account with a key threshold of 1 of 2, two people, one key each.
            This website creates no account; account creation is a step of its own.
          </dd>
        </div>
        <div>
          <dt className="eyebrow-sheet">The private key (302e…)</dt>
          <dd className="mt-2 max-w-[58ch] text-[0.9375rem] leading-relaxed text-sheet-ink">
            It comes into play later, in HashPack: “I already have a wallet” → import the
            private key, then enter the treasury account ID. Both happen when a transaction
            is due — not today.
          </dd>
        </div>
        <div>
          <dt className="eyebrow-sheet">The 24 words</dt>
          <dd className="mt-2 max-w-[58ch] text-[0.9375rem] leading-relaxed text-sheet-ink">
            Your backup. Whoever holds the phrase holds the key — treat it exactly like the
            private key itself.
          </dd>
        </div>
        <div>
          <dt className="eyebrow-sheet">Where things live</dt>
          <dd className="mt-2 max-w-[58ch] text-[0.9375rem] leading-relaxed text-sheet-ink">
            Keep them apart where you can: not the phrase and the private key both digital
            in the same place. Paper in one place, password manager in another. A backup
            everyone can find is not a backup.
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
