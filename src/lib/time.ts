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
