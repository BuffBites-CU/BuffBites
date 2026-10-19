import { apiFetch } from './api'
import type { BodyStats, DiningHall, FuelBudget, FuelPlan, StravaStatus } from '@/types'

// ── Strava link (opt-in) ────────────────────────────────────────────────────

export function getStravaStatus(token: string): Promise<StravaStatus> {
  return apiFetch<StravaStatus>('/api/strava/status', { token })
}

/** Only called after the student agrees to the consent sheet. Returns Strava's
 *  authorize page; nothing is read from Strava until they approve there. */
export function startStravaConnect(token: string): Promise<{ url: string }> {
  return apiFetch<{ url: string }>('/api/strava/connect', {
    method: 'POST',
    body: JSON.stringify({ consent: true }),
    token,
  })
}

export function completeStravaConnect(token: string, code: string, state: string, scope: string): Promise<StravaStatus> {
  return apiFetch<StravaStatus>('/api/strava/complete', {
    method: 'POST',
    body: JSON.stringify({ code, state, scope }),
    token,
  })
}

export function disconnectStrava(token: string): Promise<StravaStatus> {
  return apiFetch<StravaStatus>('/api/strava', { method: 'DELETE', token })
}

// ── Fuel coach ──────────────────────────────────────────────────────────────

export function getBodyStats(token: string): Promise<BodyStats> {
  return apiFetch<BodyStats>('/api/coach/body', { token })
}

export function saveBodyStats(token: string, body: BodyStats): Promise<BodyStats> {
  return apiFetch<BodyStats>('/api/coach/body', { method: 'PUT', body: JSON.stringify(body), token })
}

export function getFuelBudget(token: string, date: string): Promise<FuelBudget> {
  return apiFetch<FuelBudget>(`/api/coach/budget?date=${encodeURIComponent(date)}`, { token })
}

export function buildFuelPlan(token: string, dining: DiningHall, date: string): Promise<FuelPlan> {
  return apiFetch<FuelPlan>('/api/coach/plan', {
    method: 'POST',
    body: JSON.stringify({ dining, date }),
    token,
  })
}

