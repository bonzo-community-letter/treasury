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
  'w-full border border-rule bg-page px-3 py-2.5 text-[0.9375rem] text-ink placeholder:text-ink-faint/70 focus:border-accent/70 focus:outline-none'

export const monoInputClass = `${inputClass} font-mono text-[0.8125rem]`

export const primaryAction =
  'rounded-sm bg-accent px-5 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-page transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40'

export const secondaryAction =
  'rounded-sm border border-rule px-4 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-accent hover:text-ink'

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
