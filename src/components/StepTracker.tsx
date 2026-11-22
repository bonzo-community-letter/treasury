interface Props {
  /** zero-based index of the current step */
  current: number
  labels: readonly string[]
}

/** Where in the ceremony you are: a line of segments, one per step. */
export function StepTracker({ current, labels }: Props) {
  const label = labels[current] ?? ''
  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow-sheet">
          Schritt {current + 1} von {labels.length} — {label}
        </p>
      </div>
      <div className="mt-3 flex gap-1.5" aria-hidden="true">
        {labels.map((stepLabel, index) => (
          <span
            key={stepLabel}
            className={
              index <= current
                ? 'h-[2px] flex-1 bg-accent'
                : 'h-[2px] flex-1 bg-sheet-rule'
            }
          />
        ))}
      </div>
    </div>
  )
}
