import { apiFetch } from './api'
import type { ChatMessage, ChatRoomSummary, DiningHall, DiningTable, SocialCatalog, TableInput } from '@/types'

// Everything except the catalog acts as the signed-in student (auth: true).

export function getCatalog(): Promise<SocialCatalog> {
  return apiFetch<SocialCatalog>('/api/social/catalog')
}

export function getMyInterests(): Promise<{ interests: string[] }> {
  return apiFetch('/api/social/me', { auth: true })
}

export function saveMyInterests(interests: string[]): Promise<{ interests: string[] }> {
  return apiFetch('/api/social/me', { method: 'PUT', body: JSON.stringify({ interests }), auth: true })
}

export function listRooms(): Promise<ChatRoomSummary[]> {
  return apiFetch<ChatRoomSummary[]>('/api/social/rooms', { auth: true })
}

export function listMessages(room: string, after?: string): Promise<ChatMessage[]> {
  const qs = after ? `?${new URLSearchParams({ after })}` : ''
  return apiFetch<ChatMessage[]>(`/api/social/rooms/${encodeURIComponent(room)}/messages${qs}`, { auth: true })
}

export function sendMessage(room: string, text: string): Promise<ChatMessage> {
  return apiFetch<ChatMessage>(`/api/social/rooms/${encodeURIComponent(room)}/messages`, {
    method: 'POST', body: JSON.stringify({ text }), auth: true,
  })
}

export function reportMessage(id: string): Promise<{ reported: boolean; hidden: boolean }> {
  return apiFetch(`/api/social/messages/${encodeURIComponent(id)}/report`, { method: 'POST', auth: true })
}

export function blockAuthor(id: string): Promise<{ id: string; name: string }> {
  return apiFetch(`/api/social/messages/${encodeURIComponent(id)}/block`, { method: 'POST', auth: true })
}

export function listBlocks(): Promise<Array<{ id: string; name: string }>> {
  return apiFetch('/api/social/blocks', { auth: true })
}

export function unblock(id: string): Promise<{ unblocked: boolean }> {
  return apiFetch(`/api/social/blocks/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true })
}

export function listTables(date: string, dining?: DiningHall): Promise<DiningTable[]> {
  const params = new URLSearchParams({ date })
  if (dining) params.set('dining', dining)
  return apiFetch<DiningTable[]>(`/api/social/tables?${params}`, { auth: true })
}

export function openTable(t: TableInput): Promise<DiningTable> {
  return apiFetch<DiningTable>('/api/social/tables', { method: 'POST', body: JSON.stringify(t), auth: true })
}

export function joinTable(id: string): Promise<DiningTable> {
  return apiFetch<DiningTable>(`/api/social/tables/${encodeURIComponent(id)}/join`, { method: 'POST', auth: true })
}

export function leaveTable(id: string): Promise<{ left: boolean; closed: boolean }> {
  return apiFetch(`/api/social/tables/${encodeURIComponent(id)}/leave`, { method: 'POST', auth: true })
}
