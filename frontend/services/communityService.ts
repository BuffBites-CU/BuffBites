import { apiFetch } from './api'
import type { ComboCreate, CommunityCombo, DiningHall, VoteType } from '@/types'

export function getCombos(dining_hall?: DiningHall): Promise<CommunityCombo[]> {
  const params = new URLSearchParams()
  if (dining_hall) params.set('dining_hall', dining_hall)
  const qs = params.toString()
  return apiFetch<CommunityCombo[]>(`/api/community/combos${qs ? `?${qs}` : ''}`)
}

export function getCombo(combo_id: string): Promise<CommunityCombo> {
  return apiFetch<CommunityCombo>(`/api/community/combos/${combo_id}`)
}

export function publishCombo(
  combo: ComboCreate,
  firebase_uid: string,
  username: string,
): Promise<CommunityCombo> {
  const params = new URLSearchParams({ firebase_uid, username })
  return apiFetch<CommunityCombo>(`/api/community/combos?${params}`, {
    method: 'POST',
    body: JSON.stringify(combo),
  })
}

export function vote(
  combo_id: string,
  vote_type: VoteType,
  firebase_uid: string,
): Promise<{ message: string }> {
  const params = new URLSearchParams({ vote_type, firebase_uid })
  return apiFetch<{ message: string }>(
    `/api/community/combos/${combo_id}/vote?${params}`,
    { method: 'POST', body: JSON.stringify({ vote_type }) },
  )
}

export function getTrends(dining_hall?: DiningHall): Promise<CommunityCombo[]> {
  const params = new URLSearchParams()
  if (dining_hall) params.set('dining_hall', dining_hall)
  const qs = params.toString()
  return apiFetch<CommunityCombo[]>(`/api/community/trends${qs ? `?${qs}` : ''}`)
}
