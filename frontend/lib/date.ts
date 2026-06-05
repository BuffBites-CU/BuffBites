/**
 * Calendar-date helpers pinned to Mountain Time (America/Denver).
 *
 * The dining halls are in Boulder, CO, so "today" must follow Colorado's
 * clock — not the device's timezone and not UTC. Using `Date.toISOString()`
 * for the calendar date is a bug: late evening in MST is already the next
 * day in UTC, which makes meal logs and menus jump ahead a day.
 *
 * All functions return / accept dates as `YYYY-MM-DD` strings.
 */

const TZ = 'America/Denver'

/** Today's date in Mountain Time as `YYYY-MM-DD`. */
export function todayMST(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}

/** Date offset by `days` from today (MST) as `YYYY-MM-DD`. Negative = past. */
export function isoOffsetMST(days: number): string {
  // Anchor at noon UTC so adding whole days never crosses a day boundary.
  const d = new Date(todayMST() + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/** A `Date` at local noon for an ISO date — safe for weekday/day formatting. */
export function isoToLocalNoon(iso: string): Date {
  return new Date(iso + 'T12:00:00')
}
