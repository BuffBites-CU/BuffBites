import { apiFetch } from './api'
import type { ComboCreate, ComboUpdate, CommunityCombo, DiningHall, VoteType } from '@/types'

export function getCombos(dining_hall?: DiningHall): Promise<CommunityCombo[]> {
  const qs = dining_hall ? `?${new URLSearchParams({ dining_hall })}` : ''
  // The sign-in token (when there is one) lets the server fill in has_voted.
  return apiFetch<CommunityCombo[]>(`/api/community/combos${qs}`, { auth: 'optional' })
}

export function getCombo(combo_id: string): Promise<CommunityCombo> {
  return apiFetch<CommunityCombo>(`/api/community/combos/${combo_id}`)
}

export function getUserCombos(firebase_uid: string): Promise<CommunityCombo[]> {
  return apiFetch<CommunityCombo[]>(`/api/community/combos/user/${firebase_uid}`)
}

export function updateCombo(combo_id: string, update: ComboUpdate, token: string): Promise<CommunityCombo> {
  return apiFetch<CommunityCombo>(`/api/community/combos/${combo_id}`, {
    method: 'PUT',
    body: JSON.stringify(update),
    token,
  })
}

export function deleteCombo(combo_id: string, token: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/community/combos/${combo_id}`, {
    method: 'DELETE',
    token,
  })
}

/** The author's username comes from their profile on the server, not the client. */
export function publishCombo(combo: ComboCreate, token: string): Promise<CommunityCombo> {
  return apiFetch<CommunityCombo>('/api/community/combos', {
    method: 'POST',
    body: JSON.stringify(combo),
    token,
  })
}

export function vote(
  combo_id: string,
  vote_type: VoteType,
  token: string,
): Promise<{ message: string }> {
  const params = new URLSearchParams({ vote_type })
  return apiFetch<{ message: string }>(
    `/api/community/combos/${combo_id}/vote?${params}`,
    { method: 'POST', token },
  )
}

export function getTrends(dining_hall?: DiningHall): Promise<CommunityCombo[]> {
  const qs = dining_hall ? `?${new URLSearchParams({ dining_hall })}` : ''
  // The sign-in token (when there is one) lets the server fill in has_voted.
  return apiFetch<CommunityCombo[]>(`/api/community/trends${qs}`, { auth: 'optional' })
}

export function getWeeklyTrends(dining_hall?: DiningHall): Promise<CommunityCombo[]> {
  const qs = dining_hall ? `?${new URLSearchParams({ dining_hall })}` : ''
  // The sign-in token (when there is one) lets the server fill in has_voted.
  return apiFetch<CommunityCombo[]>(`/api/community/trends/weekly${qs}`, { auth: 'optional' })
}
