import { useState } from 'react'
import { primaryAction, Warning } from './StepUi'
import { slugifyRole } from '../lib/secretFile'

interface Props {
  onBegin: (role: string) => void
}

export function IntroStep({ onBegin }: Props) {
  const [role, setRole] = useState('')

  return (
    <div>
      <h2 className="font-serif text-[1.75rem] leading-tight text-sheet-ink sm:text-4xl">
        What this page does
      </h2>
      <p className="mt-3 max-w-[58ch] text-[0.9375rem] leading-relaxed text-sheet-ink-soft">
        You are about to generate a fresh ED25519 key for the recovery treasury — here, in
        this browser window, on this machine. Everything that is created did not exist
        before and is gone once the window closes. Nothing is sent.
      </p>

      <div className="mt-8">
        <p className="eyebrow-sheet">What happens</p>
        <ul className="mt-3 space-y-2.5 text-[0.9375rem] leading-relaxed text-sheet-ink">
          <li className="flex gap-3">
            <span aria-hidden="true" className="mt-[0.65rem] h-[2px] w-4 shrink-0 bg-sheet-rule" />
            <span>
              The browser generates a fresh 24-word phrase (BIP-39) and derives a private
              and a public key from it — with the same derivation path HashPack uses.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="mt-[0.65rem] h-[2px] w-4 shrink-0 bg-sheet-rule" />
            <span>
              You write both down. At the end you hold three values: the phrase, the
              private key and the public key.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="mt-[0.65rem] h-[2px] w-4 shrink-0 bg-sheet-rule" />
            <span>
              The coordinator needs only the public key. With it the treasury account is
              opened: a regular Hedera account with a key threshold of 1 of 2 — one key
              each for two people.
            </span>
          </li>
        </ul>
      </div>

      <div className="mt-8">
        <Warning>
          Never pass the phrase or the private key on to anyone — not by email, not in
          chat, not to support. Whoever has these values has the account. The coordinator
          needs the public key only.
        </Warning>
        <p className="mt-3 max-w-[58ch] text-xs leading-relaxed text-sheet-ink-faint">
          Copying is convenient but risky: on a foreign or unclean machine, every copied
          value lands in the clipboard. Where you can, transcribe by hand.
        </p>
      </div>

      <div className="mt-10 border-t border-sheet-rule pt-6">
        <label
          htmlFor="role"
          className="eyebrow-sheet block text-[0.6875rem] font-semibold uppercase tracking-[0.16em]"
        >
          Your role — for the file name only
        </label>
        <input
          id="role"
          type="text"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          placeholder="e.g. signer-a"
          autoComplete="off"
          className="mt-3 w-full max-w-xs border-b-2 border-sheet-rule bg-transparent px-1 py-1.5 font-mono text-[0.9375rem] text-sheet-ink outline-none transition-colors focus:border-accent"
        />
        <p className="mt-2 text-xs text-sheet-ink-faint">
          The file will later be named bonzo-key-{slugifyRole(role)}.txt
        </p>
      </div>

      <div className="mt-10">
        <button type="button" onClick={() => onBegin(role)} className={primaryAction}>
          To key generation
        </button>
      </div>
    </div>
  )
}
