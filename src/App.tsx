import { useEffect, useMemo, useState } from 'react'
import { config, urlAccountOverride, walletReady } from './config'
import { fetchMirrorTransactionsByAccount } from './lib/mirror'
import { resolveRole, VISITOR_NOTE } from './lib/roles'
import { hashscanAccountUrl } from './lib/hedera'
import { useAccountKey } from './hooks/useAccountKey'
import { useTreasurySnapshot } from './hooks/useTreasurySnapshot'
import { useUsdPrice } from './hooks/useUsdPrice'
import { useWallet } from './hooks/useWallet'
import { ConnectDialog } from './components/ConnectDialog'
import { NavBar } from './components/NavBar'
import { BalanceCard } from './components/BalanceCard'
import { TransactionsPanel } from './components/TransactionsPanel'
import { SchedulesPanel } from './components/SchedulesPanel'
import { CreateTreasuryPanel } from './components/CreateTreasuryPanel'
import { ConfigureTreasuryPanel } from './components/ConfigureTreasuryPanel'
import { TransferPanel } from './components/TransferPanel'
import { Note } from './components/ui'

/**
 * The treasury page, three layers deep:
 *
 *   1. public stats — balance in HBAR and USD, recent transactions, pending
 *      scheduled transfers — readable by anyone, the default view;
 *   2. a wallet connection that resolves a role from the chain (admin /
 *      signer / visitor), shown as a badge;
 *   3. the actions that role unlocks: creating a treasury (admin) and moving
 *      HBAR out (admin or signer, direct at 1-of-N, scheduled at m-of-n).
 *
 * UI gating is cosmetic. Every transaction is signed and paid by the wallet,
 * and the chain is what enforces who can do what — see the README.
 */
export function App() {
  const wallet = useWallet()
  const [dialogOpen, setDialogOpen] = useState(false)

  const urlOverride = useMemo(() => urlAccountOverride(), [])
  const [discovered, setDiscovered] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  // Treasury discovery: what the admin account has created. The configured
  // list leads when set; the URL override previews any account at all.
  useEffect(() => {
    let cancelled = false
    void fetchMirrorTransactionsByAccount(config.network, config.adminAccount, 100)
      .then((rows) => {
        if (cancelled) return
        setDiscovered(
          rows
            .filter((row) => row.name === 'CRYPTOCREATEACCOUNT' && row.entityId !== null)
            .map((row) => row.entityId as string),
        )
      })
      .catch(() => {
        // Discovery is a convenience; the config list and ?account= still work.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const treasuries = useMemo(
    () => [...new Set([...(urlOverride ? [urlOverride] : []), ...config.configuredTreasuryAccounts, ...discovered])],
    [urlOverride, discovered],
  )
  const treasuryId = selected ?? treasuries[0] ?? null
  /** A treasury pinned in the build config is configured, never replaced by a new one. */
  const pinnedTreasury = config.configuredTreasuryAccounts.length > 0

  const treasuryKey = useAccountKey(treasuryId)
  const walletKey = useAccountKey(wallet.status === 'connected' ? wallet.accountId : null)
  const snapshot = useTreasurySnapshot(treasuryId, wallet.status === 'connected' ? wallet.accountId : null)
  const price = useUsdPrice()

  const role = resolveRole({
    connectedAccountId: wallet.status === 'connected' ? wallet.accountId : null,
    connectedKeyRaw: walletKey.singleRaw,
    adminAccount: config.adminAccount,
    treasuryAccountId: treasuryId,
    structure: treasuryKey.structure,
  })

  // One clock tick per second drives every expiry countdown.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const timer = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  const connected = wallet.status === 'connected' && wallet.accountId !== null

  return (
    <div className="min-h-dvh bg-page">
      <NavBar wallet={wallet} role={role} onConnect={() => setDialogOpen(true)} />

      <header className="border-b border-rule bg-hero">
        <div className="mx-auto w-full max-w-5xl px-6 pt-10 pb-12 sm:pt-14 sm:pb-16">
          <p className="eyebrow">Treasury · {config.network}</p>
          <h1 className="mt-4 max-w-[20ch] font-serif text-[2.25rem] leading-[1.06] tracking-tight text-ink sm:text-5xl">
            Open Letter Treasury
          </h1>
          <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-ink-soft">
            The account two people hold, one key each. Anyone can read it; moving HBAR out of it
            takes a signature.
          </p>
          {treasuryId ? (
            <p className="mt-6 text-xs text-ink-faint">
              <span className="font-mono">{treasuryId}</span>
              {' · '}
              <a
                href={hashscanAccountUrl(config.network, treasuryId)}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-rule underline-offset-4 hover:text-ink-soft hover:decoration-accent"
              >
                HashScan
              </a>
            </p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
        {treasuries.length > 1 ? (
          <div className="flex items-center gap-3">
            <span className="eyebrow">Treasury</span>
            <select
              value={treasuryId ?? ''}
              onChange={(event) => setSelected(event.target.value)}
              className="rounded-sm border border-rule bg-page/40 px-3 py-1.5 font-mono text-sm text-ink focus:border-accent focus:outline-none"
            >
              {treasuries.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {treasuries.length === 0 ? (
          <Note>
            No treasury exists yet — none is configured and the admin account has not created one.
            An admin can create one below; any account can be previewed with <code>?account=0.0.x</code> in the URL.
          </Note>
        ) : null}

        {treasuryId ? (
          <>
            <BalanceCard snapshot={snapshot} price={price} />

            {connected && role === 'visitor' && !walletKey.loading ? <Note>{VISITOR_NOTE}</Note> : null}

            <TransactionsPanel treasuryId={treasuryId} rows={snapshot.transactions} />

            <SchedulesPanel
              treasuryId={treasuryId}
              schedules={snapshot.schedules}
              structure={treasuryKey.structure}
              role={role}
              connectedKeyRaw={walletKey.singleRaw}
              nowSec={nowSec}
              searchedCreators={snapshot.searchedCreators}
              onSigned={snapshot.refresh}
            />

            {treasuryKey.error && !treasuryKey.loading ? (
              <p className="text-xs leading-relaxed text-ink-faint">{treasuryKey.error}</p>
            ) : null}

            {connected && (role === 'admin' || role === 'signer') && treasuryKey.structure ? (
              <TransferPanel
                treasuryId={treasuryId}
                structure={treasuryKey.structure}
                connectedAccountId={wallet.accountId as string}
                connectedKeyRaw={walletKey.singleRaw}
              />
            ) : null}
          </>
        ) : null}

        {pinnedTreasury ? (
          connected && (role === 'admin' || role === 'signer') && treasuryKey.structure && treasuryId ? (
            <ConfigureTreasuryPanel
              treasuryId={treasuryId}
              structure={treasuryKey.structure}
              connectedKeyRaw={walletKey.singleRaw}
              onUpdated={treasuryKey.refresh}
            />
          ) : null
        ) : connected && role === 'admin' ? (
          <CreateTreasuryPanel
            onCreated={(accountId) => {
              setDiscovered((list) => (list.includes(accountId) ? list : [...list, accountId]))
              setSelected(accountId)
            }}
          />
        ) : null}

        {!walletReady ? (
          <p className="text-xs leading-relaxed text-ink-faint">
            Wallet connection is not configured for this build — set the WalletConnect project id
            (see <code>.env.example</code>). Everything above stays readable without it.
          </p>
        ) : null}
      </main>

      <footer className="border-t border-rule/60">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-4 py-7 sm:px-6">
          <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint">
            Open letter treasury
          </span>
          <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint">
            Read from the public mirror node
          </span>
        </div>
      </footer>

      <ConnectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} wallet={wallet} />
    </div>
  )
}
