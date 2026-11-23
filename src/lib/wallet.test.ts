import { describe, expect, it } from 'vitest'
import { isExtensionAnnouncement, rememberedExtension } from './wallet'

describe('isExtensionAnnouncement', () => {
  it('accepts an extension answer that carries metadata', () => {
    expect(
      isExtensionAnnouncement({
        type: 'hedera-extension-response',
        metadata: { id: 'hashpack', name: 'HashPack' },
      }),
    ).toBe(true)
  })

  it('accepts the iframe answer, which carries the same metadata', () => {
    expect(
      isExtensionAnnouncement({ type: 'hedera-iframe-query-response', metadata: { id: 'kabila' } }),
    ).toBe(true)
  })

  it('rejects answers without metadata and every other message', () => {
    for (const data of [
      null,
      undefined,
      'hedera-extension-response',
      { type: 'hedera-extension-response' },
      { type: 'hedera-extension-query', metadata: {} },
      { type: 'something-else', metadata: { id: 'x' } },
      {},
    ]) {
      expect(isExtensionAnnouncement(data)).toBe(false)
    }
  })
})

describe('rememberedExtension', () => {
  it('is null when the browser has no storage — nothing is assumed', () => {
    expect(rememberedExtension()).toBeNull()
  })
})
