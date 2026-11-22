import { describe, expect, it } from 'vitest'
import { VISITOR_NOTE, resolveRole } from './roles'
import { treasuryKey, type TreasuryKeyStructure } from './accountKey'

const keyA = treasuryKey('ed25519', new Uint8Array(32).fill(0xaa))
const keyB = treasuryKey('ecdsa', new Uint8Array([0x03, ...new Uint8Array(32).fill(0xbb)]))
const structure: TreasuryKeyStructure = { threshold: 2, keys: [keyA, keyB] }

describe('resolveRole — the chain decides, not the config', () => {
  it('visitor while nothing is connected', () => {
    expect(resolveRole({ connectedAccountId: null, connectedKeyRaw: null, adminAccount: '0.0.9', treasuryAccountId: '0.0.4486', structure })).toBe('visitor')
  })

  it('admin is the configured admin account, id equality only', () => {
    expect(
      resolveRole({ connectedAccountId: '0.0.9', connectedKeyRaw: null, adminAccount: '0.0.9', treasuryAccountId: '0.0.4486', structure }),
    ).toBe('admin')
  })

  it('signer when the wallet account IS the treasury (its key acting through itself)', () => {
    expect(
      resolveRole({ connectedAccountId: '0.0.4486', connectedKeyRaw: null, adminAccount: '0.0.9', treasuryAccountId: '0.0.4486', structure }),
    ).toBe('signer')
  })

  it('signer when the wallet key is one of the treasury keys', () => {
    expect(
      resolveRole({ connectedAccountId: '0.0.77', connectedKeyRaw: keyB.raw, adminAccount: '0.0.9', treasuryAccountId: '0.0.4486', structure }),
    ).toBe('signer')
  })

  it('visitor for a connected wallet with no key here — even if the treasury key is unreadable', () => {
    expect(
      resolveRole({ connectedAccountId: '0.0.77', connectedKeyRaw: null, adminAccount: '0.0.9', treasuryAccountId: '0.0.4486', structure: null }),
    ).toBe('visitor')
    expect(
      resolveRole({ connectedAccountId: '0.0.77', connectedKeyRaw: 'cc'.repeat(32), adminAccount: '0.0.9', treasuryAccountId: '0.0.4486', structure }),
    ).toBe('visitor')
  })

  it('a missing treasury key structure never invents a signer', () => {
    expect(
      resolveRole({ connectedAccountId: '0.0.77', connectedKeyRaw: keyA.raw, adminAccount: '0.0.9', treasuryAccountId: '0.0.4486', structure: null }),
    ).toBe('visitor')
  })

  it('the visitor note says it plainly', () => {
    expect(VISITOR_NOTE).toMatch(/no key/i)
  })
})
