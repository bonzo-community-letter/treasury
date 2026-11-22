import { formatHbar } from '../lib/treasury'
import { formatUsd, PRICE_SOURCE_LABEL, type UsdPrice } from '../lib/price'
import { clockOfMs } from '../lib/time'
import type { TreasurySnapshotView } from '../hooks/useTreasurySnapshot'

interface Props {
  snapshot: TreasurySnapshotView
  price: { price: UsdPrice | null; loading: boolean; error: string | null; refresh: () => void }
}

/**
 * The balance, in both currencies the treasury answers to. The USD figure
 * carries its timestamp and source under the number — a rate without a date
 * is a guess wearing a decimal point.
 */
export function BalanceCard({ snapshot, price }: Props) {
  const tinybars = snapshot.account?.balanceTinybars ?? null
  const usd = tinybars !== null && price.price ? formatUsd(tinybars, price.price.usdPerHbar) : null

  return (
    <section className="border border-rule bg-hero px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow">Balance</p>
        <p className="text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint">
          {snapshot.updatedMs !== null ? `updated ${clockOfMs(snapshot.updatedMs)}` : 'reading…'}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-10 gap-y-2">
        <p className="tnum font-serif text-4xl leading-none text-ink sm:text-5xl">
          {tinybars !== null ? formatHbar(tinybars) : '—'}
        </p>
        <p className="tnum font-serif text-2xl leading-none text-ink-soft sm:text-3xl">
          {usd ?? (price.loading ? '…' : '—')}
        </p>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-ink-faint">
        {price.price
          ? `${PRICE_SOURCE_LABEL}, ${clockOfMs(price.price.fetchedAt)} · 1 HBAR = $${price.price.usdPerHbar}`
          : price.error
            ? price.error
            : 'Reading the rate…'}
      </p>

      <button
        type="button"
        onClick={() => {
          snapshot.refresh()
          price.refresh()
        }}
        className="mt-4 rounded-sm border border-rule px-3 py-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-accent hover:text-ink"
      >
        Refresh
      </button>

      {snapshot.error ? (
        <p className="mt-3 border-l-2 border-accent pl-3 text-xs leading-relaxed text-ink-soft">{snapshot.error}</p>
      ) : null}
    </section>
  )
}
