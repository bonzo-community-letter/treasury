import type { ReactNode } from 'react'

/**
 * The paper. The same sheet the open-letter site uses: a light page with its own
 * back sheet peeking out at the offset, so it reads as paper and not as a card.
 */
export function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6">
      <div
        aria-hidden="true"
        className="absolute inset-x-4 bottom-16 inset-y-0 translate-x-1.5 translate-y-2 rounded-[3px] border border-sheet-rule bg-sheet-back sm:inset-x-6"
      />
      <div className="relative min-h-[60vh] rounded-[3px] border border-sheet-rule bg-sheet px-6 py-8 shadow-[0_2px_4px_rgba(0,0,0,0.5),0_60px_100px_-60px_rgba(0,0,0,0.95)] sm:px-12 sm:py-12">
        {children}
      </div>
    </div>
  )
}
