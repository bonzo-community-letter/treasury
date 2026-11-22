# Bonzo Recovery — Schlüssel-Einrichtung

Eine kleine Website, die zwei Personen durch je eine Schlüssel-Zeremonie für das
Recovery-Treasury führt: Sie erzeugt lokal im Browser einen frischen
ED25519-Schlüssel aus einer neuen 24-Wort-Phrase (BIP-39) und übergibt am Ende
drei Werte — Phrase, privater Schlüssel, öffentlicher Schlüssel.

Design und Stack spiegeln die Open-Letter-Site (`/home/agent/repos/open-letter`):
dieselben Farb-Tokens, dieselben Schriften, derselbe Haufen Papier als Seitenform.

## Was das Tool tut — und was nicht

**Es erzeugt Schlüssel. Es legt kein Konto an.** Die Kontogründung (ein normales
Hedera-Konto mit Schlüssel-Schwelle 1 von 2, zwei Personen, je ein Schlüssel)
ist ein separater Schritt, den der Koordinator mit den öffentlichen Schlüsseln
(`302a…`) durchführt.

Ablauf in sechs Schritten:

1. **Vorbereitung** — was passiert, was man braucht, Rollenname für den Dateinamen.
2. **Erzeugen** — ein Klick, ein Schlüssel; er lebt nur im React-State.
3. **Phrase sichern** — 24 nummerierte Wörter, zwei Spalten zu zwölf; erst nach
   Checkbox „sicher gespeichert“ geht es weiter.
4. **Nachprüfen** — fünf zufällige Positionen der Phrase müssen abgetippt werden
   (Groß-/Kleinschreibung egal, Leerzeichen am Rand egal). Nach einem Fehler:
   Anzeige der falschen Stellen und „Phrase nochmal anzeigen“; das nächste Quiz
   fragt andere Stellen. Nach drei Fehlversuchen rät die Seite deutlich zum
   Neubeginn mit frischem Schlüssel („Neu beginnen“ verwirft den alten State).
5. **Übersicht** — noch einmal alles auf einem Schirm: die 24 Wörter, der private
   Schlüssel (`302e…`), der öffentliche Schlüssel (`302a…`), der Ableitungspfad.
   Pro Block Copy- und Download-Button (`bonzo-key-<rolle>.txt` mit allen drei
   Werten und dem Pfad). Drei Abhakfeldern, dann „Fertig“.
6. **Fertig** — „Und jetzt?“: öffentlicher Schlüssel → Koordinator; privater
   Schlüssel → später HashPack („I already have a wallet“ → privaten Schlüssel
   importieren → Treasury-Account-ID); Phrase → Backup.

## Schlüssel und Ableitung

Erzeugung ausschließlich mit `@hiero-ledger/sdk` (deklariert `^2.79.0` wie in
open-letter, im Lockfile auf 2.91.0 festgeschrieben — die Anker-Vektoren laufen
auf beiden Versionen gleich): `Mnemonic.generate()`
(frische 24-Wort-Phrase; die Typen designieren `generate()`, zur Laufzeit ist
das `generate24()`) und `mnemonic.toStandardEd25519PrivateKey()`. Das ist genau
HashPacks Ableitung: SLIP-0010 über den BIP-39-Samen an `m/44'/3030'/0'/0'`,
Konto-Index 0, also vollständig `m/44'/3030'/0'/0'/0'`.

Angezeigt und exportiert werden die DER-Hex-Strings, die HashPack beim Import
verlangt: privat `privateKey.toStringDer()` (`302e…`), öffentlich
`publicKey.toStringDer()` (`302a…`).

In `src/lib/keys.test.ts` sind zwei Vektor-Anker festgenagelt (BIP-39-Phrasen zu
All-null- und All-eins-Entropie). Ihre Erwartungswerte wurden vor dem Festschrei­ben
zweifach hergeleitet: mit dem SDK und mit einer unabhängigen Implementierung
(PBKDF2-HMAC-SHA512 + SLIP-0010 per `node:crypto`). Werden diese Tests rot,
passt die Ableitung nicht mehr zu HashPack — Zeremonie stoppen, Ursache klären.

## Start

```
npm ci
npm run dev            # http://127.0.0.1:5173
```

Statische Auslieferung, wie sie später auf einem USB-Stick liegen kann:

```
npm run build && npm run preview   # http://127.0.0.1:4173
```

Qualitätsschranken: `npm test`, `npm run typecheck`.

## Sicherheitsmodell

- **100 % clientseitig.** Kein Request zur Laufzeit: keine CDN-Referenzen, keine
  Webfonts, keine Analysen, kein Service Worker. Das Build-HTML verlinkt nur
  eigene Dateien; die Schriften sind System-Schriften (derselbe Stack wie
  open-letter), das Favicon liegt in `public/`.
- **CSP per Meta-Tag:** im Build `default-src 'none'; script-src 'self';
  style-src 'self'; img-src 'self'; font-src 'self'; object-src 'none';
  base-uri 'none'; form-action 'none'`. Beim `vite dev` erweitert ein Plugin in
  `vite.config.ts` die Richtlinie minimal um HMR-WebSocket und Inline-Preamble —
  nur im Dev-Modus, das Build-HTML enthält die strenge Fassung.
- **Keine Persistenz.** Kein localStorage, kein indexedDB, keine URL-Parameter,
  keine Cookies mit Secret-Material. Der Schlüsselzustand lebt ausschließlich im
  React-State: Seite schließen = alles weg.
- **Kein `console.log` von Secrets**, keine Secrets in Fehlermeldungen.
- **Zwischenablage ist ein Kompromiss:** Kopieren wird angeboten, die
  Intro-Seite sagt, warum Abschreiben von Hand auf fremden Geräten die bessere
  Wahl ist.
- **Hinweis-Banner auf jedem Bildschirm:** „Diese Seite sendet nichts — aber der
  Rechner, an dem du das siehst, muss sauber sein.“ Ein sauberer Rechner ist
  Annahme, nicht Eigenschaft dieser Seite.

Ein bekanntes, folgenloses Detail: die `long`-Bibliothek (Transitiv-Abhängigkeit
des SDK) prüft beim Start mit einem Mini-Wasm, ob WebAssembly verfügbar ist. Die
strenge CSP blockiert diesen Probe-Test — in der Browser-Konsole erscheinen zwei
protokollierte „wasm-eval“-Verletzungen aus script-src, `long` fällt schweigend
JS-Arithmetik zurück. Funktion und Sicherheit sind davon unberührt; wer die
Konsole sauber haben will, ergänzt `script-src` um `'wasm-unsafe-eval'` — für
einen Test, den diese App nicht braucht.

## Grenzen bewusst gesetzt

Das Tool gründet kein Konto, sendet nichts, prüft keine Account-ID und signiert
nichts. Wer einen privaten Schlüssel hier erzeugen lässt, sollte die Zeremonie auf
einem Gerät durchführen, das er kontrolliert — die Seite kann darüber nichts
wissen und nichts erzwingen.

## Dateien

```
index.html                 CSP-Meta, Titel, self-hosted Favicon
public/icon-256.png        Favicon (übernommen aus open-letter)
vite.config.ts             Stack wie open-letter; CSP-Plugin (dev/build)
src/main.tsx               Buffer-Polyfill (guardiert), React-Bootstrap
src/styles.css             Design-Tokens 1:1 aus open-letter
src/App.tsx                Zustandsmaschine der Zeremonie (sechs Schritte)
src/components/            Schritt-Komponenten, Sheet, Wortraster, Fortschritt
src/lib/keys.ts            Schlüsselerzeugung über das SDK
src/lib/quiz.ts            Stichproben-Logik (rein, getestet)
src/lib/secretFile.ts      Textdatei bonzo-key-<rolle>.txt (rein, getestet)
src/lib/*.test.ts          HashPack-Ankervektoren, Quiz, Dateiname/Text
```
