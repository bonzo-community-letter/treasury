import { useRef, useState, type ReactNode } from 'react'

/** Shared furniture for the app's panels — dark side of the site's family. */

export function Panel({
  step,
  title,
  note,
  children,
}: {
  step: string
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section className="border border-rule bg-hero px-5 py-6 sm:px-8 sm:py-8">
      <p className="eyebrow">{step}</p>
      <h2 className="mt-2 font-serif text-2xl leading-tight text-ink sm:text-[1.75rem]">{title}</h2>
      {note ? (
        <p className="mt-2 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-soft">{note}</p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  )
}

export const inputClass =
  'w-full rounded-sm border border-rule bg-page/40 px-3 py-2 text-[0.9375rem] text-ink outline-none placeholder:text-ink-faint focus:border-accent'

export const monoInputClass = `${inputClass} font-mono text-[0.8125rem]`

export const primaryAction =
  'rounded-sm border border-accent bg-accent px-5 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-page transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40'

/** A turning ring for a wait the page owns — the button keeps its label. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-3 w-3 shrink-0 animate-spin rounded-full border border-current border-t-transparent ${className}`}
    />
  )
}

export const secondaryAction =
  'rounded-sm border border-rule px-4 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-accent hover:text-ink'

/** A caution stripe — the family's one accent, used sparingly. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="border-l-2 border-accent pl-3 text-sm leading-relaxed text-ink-soft">{children}</p>
}

/** A refusal, in the same stripe but addressed. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="border-l-2 border-accent pl-3 text-sm leading-relaxed text-ink-soft">
      {children}
    </p>
  )
}

/** Copy-to-clipboard chip; the page is a secure context, so `clipboard` is there. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const copy = (): void => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-sm border border-rule px-3 py-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-accent hover:text-ink"
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

/** A field label in the family's voice. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">
      {children}
    </span>
  )
}

export type StatusTone = 'ok' | 'waiting' | 'error'

const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  ok: 'border-rule text-ink-soft',
  waiting: 'border-accent/70 text-accent',
  error: 'border-accent bg-accent text-page',
}

/**
 * A status pill. When there is a reason behind it — the network's own word for
 * a failure, or why a schedule is still waiting — the reason rides on the
 * badge as a tooltip, so the table stays scannable and the detail is one hover
 * away.
 */
export function StatusBadge({
  label,
  tone,
  detail,
}: {
  label: string
  tone: StatusTone
  detail?: string
}) {
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={detail ? 0 : undefined}
        aria-label={detail ? `${label}: ${detail}` : label}
        className={`border px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.14em] ${STATUS_TONE_CLASS[tone]}`}
      >
        {label}
      </span>
      {detail ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full right-0 z-20 mb-1.5 hidden w-max max-w-[15rem] break-words border border-rule bg-page px-2.5 py-1.5 text-[0.6875rem] font-normal normal-case leading-snug tracking-normal text-ink-soft shadow-lg shadow-black/40 group-hover:block group-focus-within:block"
        >
          {detail}
        </span>
      ) : null}
    </span>
  )
}

/** A square switch in the family's line weight: a track, a block, the accent when on. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  note,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
  note?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-4 w-8 shrink-0 items-center border transition-colors ${
          checked ? 'border-accent bg-accent/15' : 'border-rule bg-page'
        }`}
      >
        <span
          className={`h-3 w-3 transition-all ${checked ? 'ml-[1.05rem] bg-accent' : 'ml-0.5 bg-ink-faint'}`}
        />
      </span>
      <span>
        <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
          {label}
        </span>
        {note ? <span className="mt-1 block text-xs leading-relaxed text-ink-faint">{note}</span> : null}
      </span>
    </button>
  )
}
