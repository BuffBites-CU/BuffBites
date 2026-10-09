import { apiFetch } from './api'
import type { DiningHall, PlateAnalysis } from '@/types'

export function analyzePlate(image_base64: string, dining: DiningHall, date: string): Promise<PlateAnalysis> {
  return apiFetch<PlateAnalysis>('/api/vision/plate', {
    method: 'POST',
    body: JSON.stringify({ image_base64, media_type: 'image/jpeg', dining, date }),
  })
}

/**
 * Downscale a camera photo to ≤1024px on the long edge and re-encode as JPEG.
 * Phone photos are 3–12 MB; this keeps uploads ~150 KB and image tokens
 * (and therefore cost per scan) low without hurting food recognition.
 */
export async function photoToJpegBase64(file: File, maxEdge = 1024, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', quality).split(',', 2)[1]
}
