import { StepHeading } from './StepUi'

/** What happens after the ceremony: who needs which of the three values. */
export function DoneStep() {
  return (
    <div>
      <StepHeading title="Und jetzt?" />

      <dl className="space-y-6">
        <div>
          <dt className="eyebrow-sheet">Der öffentliche Schlüssel (302a…)</dt>
          <dd className="mt-2 max-w-[58ch] text-[0.9375rem] leading-relaxed text-sheet-ink">
            Er geht an den Koordinator. Der gründet damit das Treasury-Konto im Hedera
            mainnet — ein Konto mit Schlüssel-Schwelle 1 von 2, zwei Personen, je ein
            Schlüssel. Diese Website legt kein Konto an; die Kontogründung ist ein
            eigener Schritt.
          </dd>
        </div>
        <div>
          <dt className="eyebrow-sheet">Der private Schlüssel (302e…)</dt>
          <dd className="mt-2 max-w-[58ch] text-[0.9375rem] leading-relaxed text-sheet-ink">
            Er kommt später in HashPack zum Einsatz: „I already have a wallet“ →
            privaten Schlüssel importieren, dann die Treasury-Account-ID angeben.
            Für beides ist der Moment, in dem eine Transaktion anliegt — nicht heute.
          </dd>
        </div>
        <div>
          <dt className="eyebrow-sheet">Die 24 Wörter</dt>
          <dd className="mt-2 max-w-[58ch] text-[0.9375rem] leading-relaxed text-sheet-ink">
            Ihr Backup. Wer die Phrase hat, hat den Schlüssel — behandeln Sie sie
            genauso wie den privaten Schlüssel selbst.
          </dd>
        </div>
        <div>
          <dt className="eyebrow-sheet">Wo es liegt</dt>
          <dd className="mt-2 max-w-[58ch] text-[0.9375rem] leading-relaxed text-sheet-ink">
            Nach Möglichkeit getrennt aufbewahren: nicht Phrase und privaten Schlüssel
            beide digital am selben Ort. Papier an einem Ort, Passwort-Manager an einem
            anderen. Ein Backup, das jeder findet, ist keines.
          </dd>
        </div>
      </dl>

      <p className="mt-10 border-t border-sheet-rule pt-6 text-sm leading-relaxed text-sheet-ink-soft">
        Mit dem Schließen dieses Fensters verschwindet, was die Seite erzeugt hat.
        Was Sie aufgeschrieben haben, bleibt.
      </p>
    </div>
  )
}
