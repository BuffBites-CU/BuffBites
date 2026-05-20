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
