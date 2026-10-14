import { getFirebaseAuth } from '@/lib/firebase'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

/** An HTTP error from the API. `message` is the server's `detail` when it sent one. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

type ApiFetchOptions = RequestInit & {
  /** An explicit Firebase ID token. */
  token?: string
  /**
   * Attach the signed-in user's ID token automatically.
   * `true` requires a signed-in user; `'optional'` sends it only if there is one.
   */
  auth?: boolean | 'optional'
}

async function currentUserToken(): Promise<string | undefined> {
  return getFirebaseAuth().currentUser?.getIdToken()
}

export async function apiFetch<T>(path: string, options?: ApiFetchOptions): Promise<T> {
  const { token: explicitToken, auth, ...fetchOptions } = options ?? {}
  const token = explicitToken ?? (auth ? await currentUserToken() : undefined)
  if (auth === true && !token) throw new ApiError('Sign in first.', 401)

  const headers: Record<string, string> = {}
  if (fetchOptions.body) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`
  Object.assign(headers, fetchOptions.headers)

  const res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers })

  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const { detail } = await res.json()
      if (typeof detail === 'string') message = detail
      // A request-validation 422 lists its errors: [{ loc: [..., field], msg }].
      else if (Array.isArray(detail) && typeof detail[0]?.msg === 'string') {
        const { loc, msg } = detail[0]
        const field = Array.isArray(loc) && loc.length > 1 ? loc[loc.length - 1] : null
        message = typeof field === 'string' ? `${field.replace(/_/g, ' ')}: ${msg}` : msg
      }
    } catch {
      // ignore parse errors — use the default message
    }
    throw new ApiError(message, res.status)
  }

  return res.json() as Promise<T>
}

/** True when `err` is an API error with the given status. */
export function isApiStatus(err: unknown, status: number): err is ApiError {
  return err instanceof ApiError && err.status === status
}
