import { apiFetch } from './api'
import type { Comment } from '@/types'

export function getComments(combo_id: string): Promise<Comment[]> {
  return apiFetch<Comment[]>(`/api/community/combos/${combo_id}/comments`)
}

export function addComment(combo_id: string, text: string, token: string): Promise<Comment> {
  return apiFetch<Comment>(`/api/community/combos/${combo_id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text }),
    token,
  })
}

export function deleteComment(comment_id: string, token: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/community/comments/${comment_id}`, {
    method: 'DELETE',
    token,
  })
}
