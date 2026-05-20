const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

type ApiFetchOptions = RequestInit & { token?: string }

export async function apiFetch<T>(path: string, options?: ApiFetchOptions): Promise<T> {
  const { token, ...fetchOptions } = options ?? {}
  const headers: Record<string, string> = {}
  if (fetchOptions.body) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`
  Object.assign(headers, fetchOptions.headers)

  const res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers })

  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') message = body.detail
    } catch {
      // ignore parse errors — use the default message
    }
    throw new Error(message)
  }

  return res.json() as Promise<T>
}
