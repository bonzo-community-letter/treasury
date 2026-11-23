/**
 * Time, as the mirror hands it out: `seconds.nanoseconds` strings, and the
 * few human formats the stats layer prints. Everything here is pure — the
 * clock is always a parameter.
 */

/** `1795378893.593108104` → `1795378893`; null for malformed input. */
export function secondsOfTimestamp(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null
  const [seconds] = timestamp.split('.')
  const value = Number(seconds)
  return Number.isFinite(value) ? value : null
}

/** Local `HH:MM` from epoch milliseconds — the "updated HH:MM" label. */
export function clockOfMs(ms: number): string {
  const date = new Date(ms)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const dayTime = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** `22 Nov, 14:05` — one line for the transaction table. */
export function shortDateTime(epochSec: number | null): string {
  if (epochSec === null) return '—'
  return dayTime.format(new Date(epochSec * 1000))
}

/**
 * Countdown prose for an expiring schedule: `in 6 h 12 m` while there is
 * room, `in 4 min 03 s` under an hour, `any moment now` under a minute.
 */
export function countdown(expirySec: number | null, nowSec: number): string {
  if (expirySec === null) return 'no expiry reported'
  const remaining = expirySec - nowSec
  if (remaining <= 0) return 'past its expiry'
  const days = Math.floor(remaining / 86_400)
  const hours = Math.floor((remaining % 86_400) / 3_600)
  const minutes = Math.floor((remaining % 3_600) / 60)
  const seconds = remaining % 60
  if (days >= 1) return `in ${days} d ${hours} h`
  if (hours >= 1) return `in ${hours} h ${String(minutes).padStart(2, '0')} m`
  if (minutes >= 1) return `in ${minutes} min ${String(seconds).padStart(2, '0')} s`
  return 'any moment now'
}

/**
 * Strict chronological comparison of two mirror timestamps, as strings —
 * `seconds.nanoseconds`, so the nanoseconds decide ties and a plain string
 * compare would be wrong the moment the digits differ in length.
 * Negative when `a` is older, positive when it is newer, 0 when equal;
 * an unknown timestamp sorts last.
 */
export function compareTimestamps(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  if (a === b) return 0
  const [aSec, aNano] = partsOf(a)
  const [bSec, bNano] = partsOf(b)
  if (aSec !== bSec) return aSec > bSec ? 1 : -1
  if (aNano !== bNano) return aNano > bNano ? 1 : -1
  return 0
}

/** `1795378893.593108104` → [seconds, nanoseconds]; junk reads as zero. */
function partsOf(timestamp: string): [bigint, bigint] {
  const [seconds = '', nanos = ''] = timestamp.split('.')
  try {
    return [BigInt(seconds.trim() || '0'), BigInt(nanos.padEnd(9, '0').slice(0, 9) || '0')]
  } catch {
    return [0n, 0n]
  }
}

/** Newest first — the order both lists are read in. */
export function newestFirst<T>(pick: (item: T) => string | null | undefined) {
  return (a: T, b: T): number => compareTimestamps(pick(b), pick(a))
}
