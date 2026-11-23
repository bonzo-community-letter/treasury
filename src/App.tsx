import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { config, urlAccountOverride, walletReady } from './config'
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
import { TransferPanel } from './components/TransferPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { Note } from './components/ui'

type Tab = 'record' | 'new'

/**
 * The treasury page. Two shapes, decided by configuration alone:
 *
 *   - `VITE_TREASURY_ACCOUNTS` empty: there is no treasury to read, so the
 *     page is the one thing left to do — creating it (admin only), and no
 *     statistics.
 *   - an account in `VITE_TREASURY_ACCOUNTS`: the record (balance in HBAR and
 *     USD, transactions, pending schedules) and a second view for making the
 *     next transfer. The key — signers and threshold — sits behind a dialog,
 *     reachable only by a wallet that holds one of the treasury's keys.
 *
 * `?account=0.0.x` previews any account without touching the config.
 *
 * UI gating is cosmetic. Every transaction is signed and paid by the wallet,
 * and the chain is what enforces who can do what — see the README.
 */
export function App() {
  const wallet = useWallet()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('record')

  const urlOverride = useMemo(() => urlAccountOverride(), [])
  const [selected, setSelected] = useState<string | null>(null)

  const treasuries = useMemo(
    () => [...new Set([...(urlOverride ? [urlOverride] : []), ...config.configuredTreasuryAccounts])],
    [urlOverride],
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
  const canAct = connected && (role === 'admin' || role === 'signer')
  const canConfigure = canAct && treasuryKey.structure !== null

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
            {treasuryId
              ? 'Balance, transactions and scheduled transfers, read from the public mirror node.'
              : 'The treasury account does not exist yet. It is created once, with its signer keys and a threshold.'}
          </p>
          {treasuryId ? (
            <p className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-ink-faint">
              <span className="font-mono">{treasuryId}</span>
              <a
                href={hashscanAccountUrl(config.network, treasuryId)}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-rule underline-offset-4 hover:text-ink-soft hover:decoration-accent"
              >
                HashScan
              </a>
              {canConfigure ? (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint underline decoration-rule underline-offset-4 transition-colors hover:text-ink hover:decoration-accent"
                >
                  Settings
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
        {treasuryId === null ? (
          connected && role === 'admin' ? (
            <CreateTreasuryPanel
              onCreated={(accountId) => {
                setSelected(accountId)
                setTab('record')
              }}
            />
          ) : (
            <section className="border border-rule bg-hero px-5 py-6 sm:px-8 sm:py-8">
              <p className="eyebrow">Treasury</p>
              <h2 className="mt-2 font-serif text-2xl leading-tight text-ink">No treasury yet</h2>
              <p className="mt-2 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-soft">
                Only the administrator,{' '}
                <span className="font-mono text-[0.8125rem]">{config.adminAccount}</span>, can
                create it. Connect that wallet to continue.
              </p>
              {connected ? (
                <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                  Connected wallet: <span className="font-mono">{wallet.accountId}</span> (not the
                  administrator).
                </p>
              ) : null}
            </section>
          )
        ) : (
          <>
            {treasuries.length > 1 ? (
              <div className="flex items-center gap-3">
                <span className="eyebrow">Treasury</span>
                <select
                  value={treasuryId}
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

            <nav className="flex items-center gap-6 border-b border-rule/60" aria-label="Views">
              <TabButton active={tab === 'record'} onClick={() => setTab('record')}>
                Overview
              </TabButton>
              <TabButton active={tab === 'new'} onClick={() => setTab('new')}>
                New transaction
              </TabButton>
            </nav>

            {tab === 'record' ? (
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
                  onSigned={snapshot.refresh}
                />

                {treasuryKey.error && !treasuryKey.loading ? (
                  <p className="text-xs leading-relaxed text-ink-faint">{treasuryKey.error}</p>
                ) : null}
              </>
            ) : canAct && treasuryKey.structure ? (
              <TransferPanel
                treasuryId={treasuryId}
                structure={treasuryKey.structure}
                connectedAccountId={wallet.accountId as string}
                connectedKeyRaw={walletKey.singleRaw}
              />
            ) : (
              <section className="border border-rule bg-hero px-5 py-6 sm:px-8 sm:py-8">
                <p className="eyebrow">New transaction</p>
                <h2 className="mt-2 font-serif text-2xl leading-tight text-ink">
                  A treasury key is required
                </h2>
                <p className="mt-2 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-soft">
                  Sending from this account is signed by one of its keys. Connect a wallet that
                  holds one. At a threshold of 1 the transfer is sent directly; above 1 it becomes
                  a scheduled transaction.
                </p>
              </section>
            )}
          </>
        )}

        {!walletReady ? (
          <p className="text-xs leading-relaxed text-ink-faint">
            No WalletConnect project id in this build; the wallet is unavailable. Reading the
            account still works.
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

      {treasuryId && treasuryKey.structure && canConfigure ? (
        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          treasuryId={treasuryId}
          structure={treasuryKey.structure}
          connectedKeyRaw={walletKey.singleRaw}
          onUpdated={treasuryKey.refresh}
        />
      ) : null}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`-mb-px border-b-2 pb-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] transition-colors ${
        active ? 'border-accent text-ink' : 'border-transparent text-ink-faint hover:text-ink-soft'
      }`}
    >
      {children}
    </button>
  )
}
