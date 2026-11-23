import { describe, expect, it } from 'vitest'
import { hasConnectedBefore, rememberedExtension } from './wallet'

describe('rememberedExtension', () => {
  it('is null without browser storage — nothing is assumed', () => {
    expect(rememberedExtension()).toBeNull()
    expect(hasConnectedBefore()).toBe(false)
  })
})
