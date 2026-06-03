import { apiFetch } from './api'
import type { ComboCreate, ComboUpdate, CommunityCombo, DiningHall, VoteType } from '@/types'

export function getCombos(dining_hall?: DiningHall, firebase_uid?: string): Promise<CommunityCombo[]> {
  const params = new URLSearchParams()
  if (dining_hall) params.set('dining_hall', dining_hall)
  if (firebase_uid) params.set('firebase_uid', firebase_uid)
  const qs = params.toString()
  return apiFetch<CommunityCombo[]>(`/api/community/combos${qs ? `?${qs}` : ''}`)
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

export function publishCombo(
  combo: ComboCreate,
  token: string,
  username: string,
): Promise<CommunityCombo> {
  const params = new URLSearchParams({ username })
  return apiFetch<CommunityCombo>(`/api/community/combos?${params}`, {
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

export function getTrends(dining_hall?: DiningHall, firebase_uid?: string): Promise<CommunityCombo[]> {
  const params = new URLSearchParams()
  if (dining_hall) params.set('dining_hall', dining_hall)
  if (firebase_uid) params.set('firebase_uid', firebase_uid)
  const qs = params.toString()
  return apiFetch<CommunityCombo[]>(`/api/community/trends${qs ? `?${qs}` : ''}`)
}

export function getWeeklyTrends(dining_hall?: DiningHall, firebase_uid?: string): Promise<CommunityCombo[]> {
  const params = new URLSearchParams()
  if (dining_hall) params.set('dining_hall', dining_hall)
  if (firebase_uid) params.set('firebase_uid', firebase_uid)
  const qs = params.toString()
  return apiFetch<CommunityCombo[]>(`/api/community/trends/weekly${qs ? `?${qs}` : ''}`)
}
