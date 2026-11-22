import { useEffect, useRef } from 'react'
import type { WalletApi } from '../hooks/useWallet'
import { INSECURE_CONTEXT_MESSAGE, WALLET_OPTIONS, hasWebCrypto, type WalletKind } from '../lib/wallet'
import { config } from '../config'

interface Props {
  open: boolean
  onClose: () => void
  wallet: WalletApi
}

/**
 * The wallet menu, ported from the treasury console with the behavior kept:
 * three ways in, all of them the same protocol — a Hedera WalletConnect
 * pairing the wallet approves. No key, no seed phrase, no signature is asked
 * for here; only a session. What the session can eventually be asked to do
 * is spelled out, because this one will be asked to spend.
 */
export function ConnectDialog({ open, onClose, wallet }: Props) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    const overflow = document.body.style.overflow

    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector<HTMLElement>('button, a[href]')?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const busy = wallet.status === 'connecting' || wallet.status === 'restoring'
  const connected = wallet.status === 'connected' && wallet.accountId !== null
  const secure = hasWebCrypto()
  const current = wallet.kind ? WALLET_OPTIONS.find((option) => option.kind === wallet.kind) : null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-page/80 backdrop-blur-sm"
        tabIndex={-1}
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-title"
        className="relative m-3 max-h-[85dvh] w-full max-w-sm overflow-y-auto border border-rule bg-hero p-6 shadow-2xl shadow-black/60 sm:m-0"
      >
        <p className="eyebrow">{config.network} network</p>
        <h2 id="connect-title" className="mt-2 font-serif text-2xl leading-tight text-ink">
          {connected ? 'Wallet connected' : 'Connect a wallet'}
        </h2>

        {!secure ? (
          <>
            <p className="mt-4 border-l-2 border-accent pl-3 text-sm leading-relaxed text-ink-soft">
              {INSECURE_CONTEXT_MESSAGE}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              This page is on{' '}
              <span className="break-all font-mono">
                {typeof location === 'undefined' ? 'an insecure origin' : location.origin}
              </span>
              . A wallet handshake needs <code className="font-mono">crypto.subtle</code>, which
              browsers only expose over HTTPS or on localhost.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint hover:text-ink-soft"
            >
              Cancel
            </button>
          </>
        ) : connected ? (
          <>
            <p className="mt-4 break-all font-mono text-sm text-ink-soft">{wallet.accountId}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-faint">
              This account pays the fee of any transaction it submits. The page never sees a
              private key.
            </p>
            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => void wallet.disconnect()}
                className="rounded-sm border border-rule px-4 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-accent hover:text-ink"
              >
                Disconnect
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint hover:text-ink-soft"
              >
                Close
              </button>
            </div>
          </>
        ) : busy ? (
          <div className="mt-5">
            <p className="text-sm leading-relaxed text-ink-soft">
              {wallet.status === 'restoring'
                ? 'Restoring your previous session…'
                : current
                  ? `Approve the connection in ${current.label}.`
                  : 'Approve the connection in your wallet.'}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-faint">
              Nothing is submitted yet. This only opens a session.
            </p>
            {wallet.route === 'dialog' && wallet.kind && wallet.kind !== 'walletconnect' ? (
              <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                No {current ? current.label : 'wallet'} extension answered on this browser, so the
                pairing code is the way in: scan it with the app, or paste it into the extension.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                wallet.cancel()
                onClose()
              }}
              className="mt-6 rounded-sm border border-rule px-4 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-accent hover:text-ink"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Your wallet approves one request per action and pays its fee. This page never sees a
              private key.
            </p>

            <ul className="mt-5 space-y-2">
              {WALLET_OPTIONS.map((option) => (
                <li key={option.kind}>
                  <button
                    type="button"
                    onClick={() => void wallet.connect(option.kind as WalletKind)}
                    className="group flex w-full items-baseline justify-between gap-4 border border-rule px-4 py-3 text-left transition-colors hover:border-accent/70 hover:bg-white/[0.03]"
                  >
                    <span className="font-serif text-base text-ink">{option.label}</span>
                    <span className="text-right text-[0.6875rem] uppercase tracking-[0.12em] text-ink-faint group-hover:text-ink-soft">
                      {option.note}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {wallet.error ? (
              <p role="alert" className="mt-4 border-l-2 border-accent pl-3 text-xs leading-relaxed text-ink-soft">
                {wallet.error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              className="mt-6 text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint hover:text-ink-soft"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
