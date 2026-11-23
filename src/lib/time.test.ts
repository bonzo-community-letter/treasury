import { describe, expect, it } from 'vitest'
import { compareTimestamps, newestFirst } from './time'

describe('compareTimestamps', () => {
  it('orders by seconds, then by nanoseconds', () => {
    expect(compareTimestamps('1795363466.1', '1795363466.2')).toBeLessThan(0)
    expect(compareTimestamps('1795363466.2', '1795363466.1')).toBeGreaterThan(0)
    expect(compareTimestamps('1795363466.100000000', '1795363466.1')).toBe(0)
    expect(compareTimestamps('1795363467.000000001', '1795363466.999999999')).toBeGreaterThan(0)
  })

  it('puts an unknown timestamp last', () => {
    expect(compareTimestamps(null, '1795363466.1')).toBeGreaterThan(0)
    expect(compareTimestamps('1795363466.1', null)).toBeLessThan(0)
    expect(compareTimestamps(null, null)).toBe(0)
  })

  it('sorts newest first through the helper', () => {
    const rows = [{ t: '1795363400.0' }, { t: '1795363600.5' }, { t: '1795363500.9' }]
    expect([...rows].sort(newestFirst((row) => row.t)).map((row) => row.t)).toEqual([
      '1795363600.5',
      '1795363500.9',
      '1795363400.0',
    ])
  })
})
