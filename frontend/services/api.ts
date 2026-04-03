// services/api.ts
// Base fetch wrapper used by all service files.
//
// BASE_URL
//   Read from process.env.NEXT_PUBLIC_API_URL
//   Falls back to "http://localhost:8000" for local development
//
// apiFetch<T>(path, options?)
//   Generic helper that:
//     1. Prepends BASE_URL to the path
//     2. Sets Content-Type: application/json header by default
//     3. Awaits the response
//     4. If !res.ok → parses the FastAPI error body and throws an Error
//        with the "detail" string so components can show it in a toast
//     5. Returns res.json() typed as T
//
//   All service functions call apiFetch — never call fetch() directly in components
