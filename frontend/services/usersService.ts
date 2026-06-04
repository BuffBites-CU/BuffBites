import { apiFetch } from './api'
import type { UserCreate, UserResponse, MealLogEntry, FavoriteCombo } from '@/types'

export function createUser(user: UserCreate): Promise<UserResponse> {
  return apiFetch<UserResponse>('/api/users/', {
    method: 'POST',
    body: JSON.stringify(user),
  })
}

export function checkUsernameAvailable(username: string): Promise<{ available: boolean }> {
  return apiFetch<{ available: boolean }>(`/api/users/check-username/${encodeURIComponent(username)}`)
}

export function getUser(firebase_uid: string): Promise<UserResponse> {
  return apiFetch<UserResponse>(`/api/users/${firebase_uid}`)
}

export function updateUser(
  firebase_uid: string,
  updates: Partial<UserCreate>,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/users/${firebase_uid}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export function deleteMeal(
  firebase_uid: string,
  logged_at: string,
): Promise<{ message: string }> {
  const params = new URLSearchParams({ logged_at })
  return apiFetch<{ message: string }>(`/api/users/${firebase_uid}/meal-log?${params}`, {
    method: 'DELETE',
  })
}

export function addFavorite(
  firebase_uid: string,
  combo: Omit<FavoriteCombo, 'saved_at'>,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/users/${firebase_uid}/favorites`, {
    method: 'POST',
    body: JSON.stringify(combo),
  })
}

export function removeFavorite(
  firebase_uid: string,
  title: string,
  dining_hall: string,
  date: string,
): Promise<{ message: string }> {
  const params = new URLSearchParams({ title, dining_hall, date })
  return apiFetch<{ message: string }>(`/api/users/${firebase_uid}/favorites?${params}`, {
    method: 'DELETE',
  })
}

export function logMeal(
  firebase_uid: string,
  entry: Omit<MealLogEntry, 'logged_at' | 'protein_g'> & { protein_g?: number },
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/users/${firebase_uid}/meal-log`, {
    method: 'POST',
    body: JSON.stringify(entry),
  })
}
