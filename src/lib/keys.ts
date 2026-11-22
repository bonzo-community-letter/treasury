import { Mnemonic } from '@hiero-ledger/sdk'

/**
 * The key material the ceremony produces. Hex DER strings, exactly as HashPack wants
 * them: the private key starts `302e…`, the public key starts `302a…`.
 *
 * Derivation is the SDK's standard ED25519 path — SLIP-0010 over the BIP-39 seed at
 * m/44'/3030'/0'/0' plus account index 0, i.e. m/44'/3030'/0'/0'/0'. That is what
 * HashPack derives on import; nothing here invents its own crypto.
 */
export interface GeneratedKeys {
  /** the 24 BIP-39 words, in order */
  words: readonly string[]
  /** PKCS#8 hex DER, `302e…` */
  privateDer: string
  /** SPKI hex DER, `302a…` */
  publicDer: string
}

/** A fresh 24-word phrase and its ED25519 key pair. Call once per ceremony. */
export async function generateKeys(): Promise<GeneratedKeys> {
  // `Mnemonic.generate()` is the 24-word generator (the SDK's `generate24()` at
  // runtime; the 2.79 type declarations only carry `generate()`), `generate12()` is
  // the short one. Nothing here derives anything by hand.
  const mnemonic = await Mnemonic.generate()
  const privateKey = await mnemonic.toStandardEd25519PrivateKey()
  return {
    words: mnemonic.toString().trim().split(/\s+/),
    privateDer: privateKey.toStringDer(),
    publicDer: privateKey.publicKey.toStringDer(),
  }
}

/**
 * The path HashPack and the SDK agree on, spelled out in full (account index 0).
 * Shown in the UI and written into the download so the paper record carries it.
 */
export const DERIVATION_PATH = "m/44'/3030'/0'/0'/0'"
