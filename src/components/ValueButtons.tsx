import { useEffect, useState } from 'react'
import { downloadTextFile } from '../lib/publicKeyFile'

/** The same small paper-toned action the letter pages use for secondary steps. */
export const miniAction =
  'rounded-sm border border-sheet-rule px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-sheet-ink-soft transition-colors hover:border-accent hover:text-sheet-ink'

interface CopyProps {
  text: string
  label?: string
}

/**
 * Copy to the clipboard. The intro explains why the clipboard is the pragmatic
 * choice rather than the safe one — the fallback notice never prints the secret.
 */
export function CopyButton({ text, label }: CopyProps) {
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const copy = (): void => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => setNotice('Copied'))
      .catch(() => setNotice('Clipboard blocked — select the text and copy it yourself'))
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" onClick={copy} className={miniAction}>
        {label ?? 'Copy'}
      </button>
      {notice ? (
        <span
          role="status"
          className="text-[0.625rem] uppercase tracking-[0.14em] text-sheet-ink-faint"
        >
          {notice}
        </span>
      ) : null}
    </span>
  )
}

interface DownloadProps {
  fileName: string
  text: string
}

export function DownloadButton({ fileName, text }: DownloadProps) {
  return (
    <button
      type="button"
      onClick={() => downloadTextFile(fileName, text)}
      className={miniAction}
    >
      Download
    </button>
  )
}
