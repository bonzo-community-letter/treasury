/**
 * The panel a tab shows when the connected wallet cannot act there.
 *
 * Three states, because they need three different sentences: no wallet at all,
 * a wallet that holds no treasury key, and the moment before the key structure
 * has been read. The old copy said one thing for all three — including a claim
 * about a key it had not seen yet.
 */
export function NoAccessPanel({
  step,
  connectTitle,
  action,
  connected,
  canAct,
  accountId,
}: {
  /** The tab's own name, as its eyebrow. */
  step: string
  /** Headline for the no-wallet state. */
  connectTitle: string
  /** What this tab does, as a verb phrase: "create a transaction". */
  action: string
  connected: boolean
  canAct: boolean
  accountId: string | null
}) {
  return (
    <section className="border border-rule bg-hero px-5 py-6 sm:px-8 sm:py-8">
      <p className="eyebrow">{step}</p>

      {!connected ? (
        <>
          <h2 className="mt-2 font-serif text-2xl leading-tight text-ink">{connectTitle}</h2>
          <p className="mt-2 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-soft">
            Only the administrator and the treasury's signers can {action}. Connect one of those
            wallets to continue.
          </p>
        </>
      ) : !canAct ? (
        <>
          <h2 className="mt-2 font-serif text-2xl leading-tight text-ink">
            This wallet has no treasury access
          </h2>
          <p className="mt-2 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-soft">
            The connected account{' '}
            <span className="break-all font-mono text-[0.875rem] text-ink">{accountId}</span> holds
            none of this treasury's keys. To {action}, the wallet has to sign for the treasury, so
            this one can only read the page.
          </p>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-soft">
            Disconnect it in the bar above and connect the administrator wallet or one of the
            signers.
          </p>
        </>
      ) : (
        <>
          <h2 className="mt-2 font-serif text-2xl leading-tight text-ink">Reading the treasury key…</h2>
          <p className="mt-2 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-soft">
            This tab appears as soon as the key structure is known.
          </p>
        </>
      )}
    </section>
  )
}
