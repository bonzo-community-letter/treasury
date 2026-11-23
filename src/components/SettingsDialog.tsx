import { useEffect, useRef } from 'react'
import type { TreasuryKeyStructure } from '../lib/accountKey'
import { TreasuryKeyForm } from './TreasuryKeyForm'

/**
 * The treasury's settings, behind a dialog. They change rarely and only for
 * someone who already holds a key, so they do not deserve a tab of their
 * own — the page keeps its two working views (the record and the next
 * transaction) and this opens over them when asked.
 */
export function SettingsDialog({
  open,
  onClose,
  treasuryId,
  structure,
  connectedKeyRaw,
  onUpdated,
}: {
  open: boolean
  onClose: () => void
  treasuryId: string
  structure: TreasuryKeyStructure
  connectedKeyRaw: string | null
  onUpdated: () => void
}) {
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
    panel.current?.querySelector<HTMLElement>('input, button, a[href]')?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [open, onClose])

  if (!open) return null

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
        aria-labelledby="settings-title"
        className="relative m-3 max-h-[85dvh] w-full max-w-lg overflow-y-auto border border-rule bg-hero p-6 shadow-2xl shadow-black/60 sm:m-0"
      >
        <p className="eyebrow">Treasury · settings</p>
        <h2 id="settings-title" className="mt-2 font-serif text-2xl leading-tight text-ink">
          Change the treasury key
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Who signs and how many of them must. The account keeps its id{' '}
          <span className="font-mono text-[0.8125rem]">{treasuryId}</span> and its balance; the
          update is signed by the key it holds now — {structure.threshold} of {structure.keys.length}.
        </p>

        <div className="mt-5">
          <TreasuryKeyForm
            treasuryId={treasuryId}
            structure={structure}
            connectedKeyRaw={connectedKeyRaw}
            onUpdated={onUpdated}
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint hover:text-ink-soft"
        >
          Close
        </button>
      </div>
    </div>
  )
}
