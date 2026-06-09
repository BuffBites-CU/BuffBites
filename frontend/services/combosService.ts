import { apiFetch } from './api'
import type { ComboResponse, DietaryPreference, DiningHall, MenuResponse, NutritionGoals } from '@/types'

export function generateCombos(
  dining: DiningHall,
  date?: string,
  goals?: NutritionGoals,
  dietaryPreferences?: DietaryPreference[],
): Promise<ComboResponse> {
  const params = new URLSearchParams({ dining })
  if (date) params.set('date', date)
  if (goals?.protein_g_per_meal) params.set('protein_goal', String(goals.protein_g_per_meal))
  if (goals?.dietary_focus)      params.set('dietary_focus', goals.dietary_focus)
  if (goals?.priority_nutrients?.length) params.set('priority_nutrients', goals.priority_nutrients.join(','))
  if (dietaryPreferences?.length) params.set('dietary_preferences', dietaryPreferences.join(','))
  return apiFetch<ComboResponse>(`/api/combos/generate?${params}`)
}

export function getMenu(dining: DiningHall, date: string): Promise<MenuResponse> {
  return apiFetch<MenuResponse>(`/api/menu?dining=${dining}&date=${date}`)
}

export interface NutritionInfo {
  calories?: number
  protein_g?: number
  fat_g?: number
  carbs_g?: number
  serving_size?: string
}

export function getNutrition(
  dining: string,
  date: string,
  dishes: string[],
): Promise<Record<string, NutritionInfo>> {
  const params = new URLSearchParams({ dining, date, dishes: dishes.join(',') })
  return apiFetch<Record<string, NutritionInfo>>(`/api/menu/nutrition?${params}`)
}
