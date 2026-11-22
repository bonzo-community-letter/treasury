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
        Was diese Seite tut
      </h2>
      <p className="mt-3 max-w-[58ch] text-[0.9375rem] leading-relaxed text-sheet-ink-soft">
        Sie erzeugen gleich einen frischen ED25519-Schlüssel für das Recovery-Treasury — hier,
        in diesem Browserfenster, auf diesem Rechner. Alles, was entsteht, war vorher nicht da
        und geht nach dem Schließen des Fensters verloren. Es wird nichts gesendet.
      </p>

      <div className="mt-8">
        <p className="eyebrow-sheet">Was passiert</p>
        <ul className="mt-3 space-y-2.5 text-[0.9375rem] leading-relaxed text-sheet-ink">
          <li className="flex gap-3">
            <span aria-hidden="true" className="mt-[0.65rem] h-[2px] w-4 shrink-0 bg-sheet-rule" />
            <span>
              Der Browser erzeugt eine frische 24-Wort-Phrase (BIP-39) und leitet daraus einen
              privaten und einen öffentlichen Schlüssel ab — mit demselben Ableitungspfad, den
              HashPack benutzt.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="mt-[0.65rem] h-[2px] w-4 shrink-0 bg-sheet-rule" />
            <span>
              Sie notieren beides. Am Ende halten Sie drei Werte in der Hand: die Phrase, den
              privaten Schlüssel und den öffentlichen Schlüssel.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="mt-[0.65rem] h-[2px] w-4 shrink-0 bg-sheet-rule" />
            <span>
              Der Koordinator braucht nur den öffentlichen Schlüssel. Damit wird das
              Treasury-Konto angelegt: ein normales Hedera-Konto mit Schlüssel-Schwelle 1 von 2
              — je einer Schlüssel für zwei Personen.
            </span>
          </li>
        </ul>
      </div>

      <div className="mt-8">
        <p className="eyebrow-sheet">Was Sie brauchen</p>
        <ul className="mt-3 space-y-2.5 text-[0.9375rem] leading-relaxed text-sheet-ink">
          <li className="flex gap-3">
            <span aria-hidden="true" className="mt-[0.65rem] h-[2px] w-4 shrink-0 bg-sheet-rule" />
            <span>26 Minuten, in denen niemand Sie anspricht.</span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="mt-[0.65rem] h-[2px] w-4 shrink-0 bg-sheet-rule" />
            <span>
              Im Idealfall ein Gerät, das sonst nichts erledigt. Eine Netzverbindung ist nicht
              nötig — diese Seite funktioniert komplett offline.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="mt-[0.65rem] h-[2px] w-4 shrink-0 bg-sheet-rule" />
            <span>Papier und Stift oder einen Passwort-Manager.</span>
          </li>
        </ul>
      </div>

      <div className="mt-8">
        <Warning>
          Geben Sie die Phrase oder den privaten Schlüssel niemals an jemanden weiter — nicht
          per E-Mail, nicht im Chat, nicht an einen Unterstützer. Wer diese Werte hat, hat das
          Konto. Der Koordinator braucht ausschließlich den öffentlichen Schlüssel.
        </Warning>
        <p className="mt-3 max-w-[58ch] text-xs leading-relaxed text-sheet-ink-faint">
          Kopieren ist bequem, aber riskant: Auf einem fremden oder unsauberen Gerät landet
          jeder kopierte Wert in der Zwischenablage. Wo es geht, schreiben Sie von Hand ab.
        </p>
      </div>

      <div className="mt-10 border-t border-sheet-rule pt-6">
        <label
          htmlFor="role"
          className="eyebrow-sheet block text-[0.6875rem] font-semibold uppercase tracking-[0.16em]"
        >
          Ihre Rolle — nur für den Dateinamen
        </label>
        <input
          id="role"
          type="text"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          placeholder="z. B. zeichner-a"
          autoComplete="off"
          className="mt-3 w-full max-w-xs border-b-2 border-sheet-rule bg-transparent px-1 py-1.5 font-mono text-[0.9375rem] text-sheet-ink outline-none transition-colors focus:border-accent"
        />
        <p className="mt-2 text-xs text-sheet-ink-faint">
          Die Datei heißt später bonzo-key-{slugifyRole(role)}.txt
        </p>
      </div>

      <div className="mt-10">
        <button type="button" onClick={() => onBegin(role)} className={primaryAction}>
          Zur Schlüsselerzeugung
        </button>
      </div>
    </div>
  )
}
