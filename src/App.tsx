import { useEffect, useMemo, useState } from 'react'
import { config, urlAccountOverride, walletReady } from './config'
import { fetchMirrorTransactionsByAccount } from './lib/mirror'
import { resolveRole, VISITOR_NOTE, type Role } from './lib/roles'
import { hashscanAccountUrl } from './lib/hedera'
import { useAccountKey } from './hooks/useAccountKey'
import { useTreasurySnapshot } from './hooks/useTreasurySnapshot'
import { useUsdPrice } from './hooks/useUsdPrice'
import { useWallet } from './hooks/useWallet'
import { ConnectDialog } from './components/ConnectDialog'
import { BalanceCard } from './components/BalanceCard'
import { TransactionsPanel } from './components/TransactionsPanel'
import { SchedulesPanel } from './components/SchedulesPanel'
import { CreateTreasuryPanel } from './components/CreateTreasuryPanel'
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
    <div className="min-h-screen">
      <header className="border-b border-rule bg-hero">
        <div className="mx-auto flex max-w-4xl flex-wrap items-end justify-between gap-4 px-6 py-8 sm:py-10">
          <div>
            <p className="eyebrow">{config.network} · Hedera</p>
            <h1 className="mt-2 font-serif text-3xl leading-tight text-ink sm:text-4xl">Open Letter Treasury</h1>
          </div>
          <div className="flex items-center gap-3">
            {connected ? (
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="flex items-center gap-3 border border-rule px-3 py-2 transition-colors hover:border-accent/70"
              >
                <span className="font-mono text-xs text-ink-soft">{wallet.accountId}</span>
                <RoleBadge role={role} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-faint underline decoration-rule underline-offset-4 transition-colors hover:text-ink hover:decoration-accent"
              >
                Connect wallet
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8 sm:py-10">
        {treasuries.length > 1 ? (
          <div className="flex items-center gap-3">
            <span className="eyebrow">Treasury</span>
            <select
              value={treasuryId ?? ''}
              onChange={(event) => setSelected(event.target.value)}
              className="border border-rule bg-hero px-3 py-1.5 font-mono text-sm text-ink focus:border-accent/70 focus:outline-none"
            >
              {treasuries.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            {treasuryId ? (
              <a
                href={hashscanAccountUrl(config.network, treasuryId)}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline decoration-rule underline-offset-4 hover:decoration-accent"
              >
                HashScan
              </a>
            ) : null}
          </div>
        ) : treasuryId ? (
          <p className="font-mono text-sm text-ink-soft">
            {treasuryId}{' '}
            <a
              href={hashscanAccountUrl(config.network, treasuryId)}
              target="_blank"
              rel="noreferrer"
              className="text-xs underline decoration-rule underline-offset-4 hover:decoration-accent"
            >
              HashScan
            </a>
          </p>
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

        {connected && role === 'admin' ? (
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

      <footer className="border-t border-rule">
        <p className="mx-auto max-w-4xl px-6 py-6 text-xs leading-relaxed text-ink-faint">
          A static page on the public mirror node. No backend, no analytics, nothing stored; the
          wallet signs every transaction and the page never sees a private key.
        </p>
      </footer>

      <ConnectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} wallet={wallet} />
    </div>
  )
}

function RoleBadge({ role }: { role: Role }) {
  const tone =
    role === 'admin'
      ? 'border-accent text-accent'
      : role === 'signer'
        ? 'border-ink-faint text-ink-soft'
        : 'border-rule text-ink-faint'
  return (
    <span className={`border px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.14em] ${tone}`}>
      {role}
    </span>
  )
}
