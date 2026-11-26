import type { WalletApi } from '../hooks/useWallet'
import { config } from '../config'
import type { Role } from '../lib/roles'
import { prefetchWallet } from '../lib/wallet'
import { Spinner } from './ui'

/**
 * The open-letter bar, unchanged in proportion: sticky, thin, one action. The
 * treasury is a page under that site, so it carries the same bar rather than
 * a chrome of its own — the only additions are the subpage's name beside the
 * masthead and the role the connected wallet resolved to, both in the same
 * voice as everything else.
 */
export function NavBar({
  wallet,
  role,
  onConnect,
}: {
  wallet: WalletApi
  role: Role
  onConnect: () => void
}) {
  const connected = wallet.status === 'connected' && wallet.accountId !== null
  const busy = wallet.status === 'connecting' || wallet.status === 'restoring'
  const label = connected ? wallet.accountId : busy ? 'Connecting…' : 'Connect'

  return (
    <header className="sticky top-0 z-40 border-b border-rule/70 bg-page/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <span className="flex items-baseline gap-2">
          <span className="font-serif text-[0.9375rem] leading-none tracking-wide text-ink-soft">
            Bonzo Community Letter
          </span>
          <span className="font-serif text-[0.9375rem] leading-none tracking-wide text-ink-faint">
            Treasury
          </span>
        </span>

        <div className="flex items-center gap-3">
          <span className="hidden text-[0.625rem] uppercase tracking-[0.16em] text-ink-faint sm:inline">
            {config.network}
          </span>
          {connected ? <RoleLabel role={role} /> : null}
          <button
            type="button"
            onClick={onConnect}
            onPointerEnter={prefetchWallet}
            onFocus={prefetchWallet}
            aria-haspopup="dialog"
            className="flex items-center gap-2 rounded-full border border-rule px-4 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-accent hover:text-ink sm:py-1.5"
          >
            {connected ? (
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
            ) : busy ? (
              <Spinner className="text-accent" />
            ) : null}
            <span className={connected ? 'font-mono text-[0.6875rem] tracking-normal normal-case' : ''}>
              {label}
            </span>
          </button>
        </div>
      </div>
    </header>
  )
}

/** Which side of the treasury this wallet is on — set in the bar's own small caps. */
export function RoleLabel({ role }: { role: Role }) {
  // A wallet without a treasury key is not an error, but it is worth naming in
  // the same colour the page uses for what matters.
  const tone = role === 'signer' ? 'text-ink-soft' : 'text-accent'
  const word =
    role === 'admin' ? 'Administrator' : role === 'signer' ? 'Signer' : 'No treasury access'
  return <span className={`hidden text-[0.625rem] uppercase tracking-[0.16em] sm:inline ${tone}`}>{word}</span>
}
