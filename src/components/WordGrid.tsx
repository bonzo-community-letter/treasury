interface Props {
  words: readonly string[]
}

/**
 * The phrase as a paper backup sheet reads: two columns, the left one carrying
 * words 1–12, the right one 13–24. Numbered, monospace, selectable — built to be
 * copied from with pen and paper.
 */
export function WordGrid({ words }: Props) {
  const half = Math.ceil(words.length / 2)
  const columns = [words.slice(0, half), words.slice(half)]

  return (
    <div className="grid grid-cols-2 gap-x-6 sm:gap-x-12">
      {columns.map((column, columnIndex) => (
        <ol key={columnIndex} className="list-none space-y-1.5 p-0">
          {column.map((word, innerIndex) => {
            const number = columnIndex * half + innerIndex + 1
            return (
              <li key={number} className="flex items-baseline gap-2.5">
                <span className="w-6 shrink-0 text-right font-mono text-[0.6875rem] text-sheet-ink-faint">
                  {number}
                </span>
                <span className="font-mono text-[0.9375rem] leading-snug text-sheet-ink">
                  {word}
                </span>
              </li>
            )
          })}
        </ol>
      ))}
    </div>
  )
}
