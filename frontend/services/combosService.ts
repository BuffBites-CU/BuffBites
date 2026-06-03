import { apiFetch } from './api'
import type { ComboResponse, DiningHall, MenuResponse } from '@/types'

export function generateCombos(dining: DiningHall, date?: string): Promise<ComboResponse> {
  const params = new URLSearchParams({ dining })
  if (date) params.set('date', date)
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
