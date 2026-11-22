import { DERIVATION_PATH, type GeneratedKeys } from './keys'

/**
 * The text file the ceremony leaves behind: everything one holder needs, in one
 * place, named after their role. Building the text is a pure function; only
 * `downloadSecretFile` touches the DOM.
 */

/** Lowercase ASCII for filenames; anything else collapses to single hyphens. */
export function slugifyRole(role: string): string {
  const slug = role
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return slug.length > 0 ? slug : 'teilnehmer'
}

export function secretFileName(role: string): string {
  return `bonzo-key-${slugifyRole(role)}.txt`
}

export function buildSecretFileText(
  role: string,
  keys: GeneratedKeys,
  generatedAt: string,
): string {
  const words = keys.words
    .map((word, i) => `${String(i + 1).padStart(2, ' ')}. ${word}`)
    .join('\n')
  return [
    'Bonzo Lend Recovery — Schlüssel für das Treasury (Schwelle 1 von 2)',
    '',
    `Rolle:          ${role.trim() || slugifyRole(role)}`,
    `Erzeugt:        ${generatedAt}`,
    `Ableitungspfad: ${DERIVATION_PATH} (HashPack-kompatibel)`,
    '',
    'NICHT TEILEN: Phrase und privater Schlüssel gewähren vollen Zugriff auf das',
    'Konto. Der Koordinator braucht ausschließlich den öffentlichen Schlüssel.',
    '',
    '24 Wörter (BIP-39, in dieser Reihenfolge):',
    words,
    '',
    'Private Key (DER hex, beginnt mit 302e):',
    keys.privateDer,
    '',
    'Öffentlicher Schlüssel (DER hex, beginnt mit 302a):',
    keys.publicDer,
    '',
  ].join('\n')
}

/** Offer the text as a download. The browser writes the file; nothing is sent. */
export function downloadSecretFile(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // the file needs a moment to be picked up before the blob may go away
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
