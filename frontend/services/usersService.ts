import { apiFetch } from './api'
import type { UserCreate, UserUpdate, UserResponse, MealLogEntry, FavoriteCombo } from '@/types'

// Every /api/users route except check-username acts on the signed-in user's
// own profile and sends their Firebase ID token (`auth: true`).

export function createUser(user: UserCreate): Promise<UserResponse> {
  return apiFetch<UserResponse>('/api/users/', {
    method: 'POST',
    body: JSON.stringify(user),
    auth: true,
  })
}

export function checkUsernameAvailable(username: string): Promise<{ available: boolean }> {
  return apiFetch<{ available: boolean }>(`/api/users/check-username/${encodeURIComponent(username)}`)
}

export function getUser(firebase_uid: string): Promise<UserResponse> {
  return apiFetch<UserResponse>(`/api/users/${firebase_uid}`, { auth: true })
}

export function updateUser(
  firebase_uid: string,
  updates: UserUpdate,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/users/${firebase_uid}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
    auth: true,
  })
}

/** Permanently deletes the account and everything tied to it. */
export function deleteAccount(firebase_uid: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/users/${firebase_uid}`, { method: 'DELETE', auth: true })
}

export function deleteMeal(
  firebase_uid: string,
  logged_at: string,
): Promise<{ message: string }> {
  const params = new URLSearchParams({ logged_at })
  return apiFetch<{ message: string }>(`/api/users/${firebase_uid}/meal-log?${params}`, {
    method: 'DELETE',
    auth: true,
  })
}

export function addFavorite(
  firebase_uid: string,
  combo: Omit<FavoriteCombo, 'saved_at'>,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/users/${firebase_uid}/favorites`, {
    method: 'POST',
    body: JSON.stringify(combo),
    auth: true,
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
    auth: true,
  })
}

export function logMeal(
  firebase_uid: string,
  entry: Omit<MealLogEntry, 'logged_at' | 'protein_g' | 'fat_g' | 'carbs_g'> & { protein_g?: number; fat_g?: number; carbs_g?: number },
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/users/${firebase_uid}/meal-log`, {
    method: 'POST',
    body: JSON.stringify(entry),
    auth: true,
  })
}
