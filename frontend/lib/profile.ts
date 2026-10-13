/**
 * Profile rules and options shared by onboarding and the profile page.
 */

import type { DietaryPreference } from '@/types'

/** The backend enforces the same rule (USERNAME_PATTERN in user_models.py). */
export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/
export const USERNAME_RULE = '3–20 characters: letters, numbers, underscores only.'

export const DIETARY_OPTIONS: { key: DietaryPreference; label: string; icon: string }[] = [
  { key: 'vegan',       label: 'Vegan',       icon: '🌱' },
  { key: 'vegetarian',  label: 'Vegetarian',  icon: '🥗' },
  { key: 'gluten-free', label: 'Gluten-Free', icon: '🌾' },
  { key: 'halal',       label: 'Halal',       icon: '☪️' },
]
