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
  return slug.length > 0 ? slug : 'participant'
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
    'Bonzo Lend Recovery — key for the recovery treasury (threshold 1 of 2)',
    '',
    `Role:             ${role.trim() || slugifyRole(role)}`,
    `Generated:        ${generatedAt}`,
    `Derivation path:  ${DERIVATION_PATH} (HashPack-compatible)`,
    '',
    'DO NOT SHARE: the phrase and the private key grant full access to the',
    'account. The coordinator needs only the public key.',
    '',
    '24 words (BIP-39, in this order):',
    words,
    '',
    'Private key (DER hex, starts with 302e):',
    keys.privateDer,
    '',
    'Public key (DER hex, starts with 302a):',
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
