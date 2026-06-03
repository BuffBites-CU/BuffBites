import { apiFetch } from './api'
import type { UserCreate, UserResponse, MealLogEntry } from '@/types'

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

export function logMeal(
  firebase_uid: string,
  entry: Omit<MealLogEntry, 'logged_at'>,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/users/${firebase_uid}/meal-log`, {
    method: 'POST',
    body: JSON.stringify(entry),
  })
}
