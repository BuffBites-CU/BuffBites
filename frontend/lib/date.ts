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

/** The current hour (0–23) in Mountain Time. */
export function hourMST(): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    hour12: false,
  }).format(new Date())
  // en-US hour12:false can emit "24" at midnight — normalize to 0.
  return Number(h) % 24
}

/**
 * The meal period most relevant *right now* in Mountain Time:
 *   before 10:30 → Breakfast, 10:30–16:00 → Lunch, after 16:00 → Dinner.
 * Used to pre-select the tab a student most likely wants when they open the app.
 */
export function currentMealPeriodMST(): 'Breakfast' | 'Lunch' | 'Dinner' {
  const minutes = hourMST() * 60 +
    Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, minute: 'numeric' }).format(new Date()))
  if (minutes < 10 * 60 + 30) return 'Breakfast'
  if (minutes < 16 * 60) return 'Lunch'
  return 'Dinner'
}
