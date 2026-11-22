import { DERIVATION_PATH, type GeneratedKeys } from './keys'

/**
 * The text file the ceremony leaves behind: public data only, named after the
 * holder's role. The phrase and the private key are deliberately absent — the
 * file must be safe to keep digitally. Building the text is a pure function;
 * only `downloadTextFile` touches the DOM.
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

export function publicKeyFileName(role: string): string {
  return `treasury-public-key-${slugifyRole(role)}.txt`
}

export function buildPublicKeyFileText(
  role: string,
  keys: GeneratedKeys,
  generatedAt: string,
): string {
  return [
    'Open Letter Treasury — public key for the recovery treasury (threshold 1 of 2)',
    '',
    `Role:             ${role.trim() || slugifyRole(role)}`,
    `Generated:        ${generatedAt}`,
    `Derivation path:  ${DERIVATION_PATH} (HashPack-compatible)`,
    '',
    'This file contains public data only — it is safe to keep digitally.',
    'The 24 words are the secret and live off this machine; whoever holds the',
    'phrase holds the private key.',
    '',
    'Public key (DER hex, starts with 302a):',
    keys.publicDer,
    '',
  ].join('\n')
}

/** Offer the text as a download. The browser writes the file; nothing is sent. */
export function downloadTextFile(fileName: string, text: string): void {
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
