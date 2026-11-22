import { config } from '../config'
import { hashscanTransactionUrl } from '../lib/hedera'
import { formatHbar } from '../lib/treasury'
import { shortDateTime } from '../lib/time'
import { summarizeTransactions } from '../lib/txSummary'
import type { MirrorTransactionRow } from '../lib/mirror'

interface Props {
  treasuryId: string
  rows: MirrorTransactionRow[]
}

/**
 * The treasury's recent movements, read from the mirror. "Counterparty" is
 * derived from the row's transfers list — the account on the other side of
 * the treasury's movement (derivation and its fee-account caveat live in
 * `lib/txSummary.ts`, under test). The amount column is the treasury's own
 * delta, so a fee paid by someone else never masquerades as treasury
 * movement.
 */
export function TransactionsPanel({ treasuryId, rows }: Props) {
  const summaries = summarizeTransactions(treasuryId, rows, 15)

  return (
    <section className="border border-rule bg-hero px-5 py-6 sm:px-8 sm:py-8">
      <p className="eyebrow">Recent transactions</p>
      <h2 className="mt-2 font-serif text-2xl leading-tight text-ink">Last 15 on the account</h2>

      {summaries.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">Nothing indexed yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-rule text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
                <th className="py-2 pr-4 font-semibold">Time</th>
                <th className="py-2 pr-4 font-semibold">Type</th>
                <th className="py-2 pr-4 font-semibold">Counterparty</th>
                <th className="py-2 pr-4 text-right font-semibold">Treasury</th>
                <th className="py-2 pr-4 font-semibold">Result</th>
                <th className="py-2 font-semibold">Explorer</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((row) => (
                <tr
                  key={`${row.transactionId}#${row.consensusSec}`}
                  className="border-b border-rule/60 align-baseline last:border-b-0"
                >
                  <td className="tnum py-2.5 pr-4 whitespace-nowrap text-ink-soft">{shortDateTime(row.consensusSec)}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-ink">
                    {row.type.replace(/^CRYPTO/, '')}
                    {row.scheduled ? <span className="ml-2 text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">scheduled</span> : null}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-xs break-all text-ink-soft">{row.counterparty ?? '—'}</td>
                  <td className="tnum py-2.5 pr-4 text-right whitespace-nowrap text-ink">
                    {row.treasuryDelta === null ? '—' : formatHbar(row.treasuryDelta)}
                  </td>
                  <td className={`py-2.5 pr-4 whitespace-nowrap ${row.result === 'SUCCESS' ? 'text-ink-soft' : 'text-accent'}`}>
                    {row.result || '—'}
                  </td>
                  <td className="py-2.5">
                    <a
                      href={hashscanTransactionUrl(config.network, row.transactionId)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline decoration-rule underline-offset-4 transition-colors hover:decoration-accent"
                    >
                      HashScan
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
