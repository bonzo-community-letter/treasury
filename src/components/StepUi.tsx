/** Shared step furniture: heading, primary action, body copy on paper. */

export function StepHeading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-7">
      <h2 className="font-serif text-[1.75rem] leading-tight text-sheet-ink sm:text-4xl">
        {title}
      </h2>
      {note ? (
        <p className="mt-3 max-w-[56ch] text-[0.9375rem] leading-relaxed text-sheet-ink-soft">
          {note}
        </p>
      ) : null}
    </div>
  )
}

export const primaryAction =
  'rounded-sm bg-accent px-5 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-page transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40'

export const secondaryAction =
  'rounded-sm border border-sheet-rule px-4 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-sheet-ink-soft transition-colors hover:border-accent hover:text-sheet-ink'

/** A caution stripe on the sheet — the site's one loud accent, used sparingly. */
export function Warning({ children }: { children: string }) {
  return (
    <p className="border-l-2 border-accent pl-3 text-sm leading-relaxed text-sheet-ink-soft">
      {children}
    </p>
  )
}

/** A checkbox the ceremony waits on. */
export function AckRow({
  checked,
  onChange,
  text,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  text: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[0.9375rem] leading-relaxed text-sheet-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-accent"
      />
      <span>{text}</span>
    </label>
  )
}
