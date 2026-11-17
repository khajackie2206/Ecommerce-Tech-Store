// One place for every call to the NestJS API.
// In development Vite forwards /api to localhost:3000 (vite.config.ts);
// in Docker nginx does the same (nginx.conf). So the browser only ever sees /api/v1.
const BASE_URL = '/api/v1'

// Login token storage key (Part 10 writes it after login)
export const TOKEN_KEY = 'techstore_token'

// Body NestJS sends for every error: { message, error, statusCode }.
// "message" is a string, or an array of strings for validation errors (400).
type NestErrorBody = {
  message?: string | string[]
  error?: string
  statusCode?: number
}

// Thrown for every failed request, so components can show `error.message`
// and branch on `error.status` (404 -> "not found" page, 401 -> login...)
export class ApiError extends Error {
  readonly status: number
  readonly messages: string[]

  constructor(status: number, messages: string[]) {
    super(messages.join('. '))
    this.name = 'ApiError'
    this.status = status
    this.messages = messages
  }
}

type QueryValue = string | number | boolean | undefined | null

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  params?: Record<string, QueryValue>
}

// Fallback text when the server did not send a message (or did not answer at all)
function defaultMessage(status: number): string {
  if (status === 0) return 'Không kết nối được máy chủ, vui lòng thử lại'
  if (status === 401) return 'Bạn cần đăng nhập'
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này'
  if (status === 404) return 'Không tìm thấy dữ liệu'
  if (status >= 500) return 'Máy chủ đang gặp sự cố, vui lòng thử lại sau'
  return `Có lỗi xảy ra (mã ${status})`
}

function toMessages(body: NestErrorBody | null, status: number): string[] {
  const message = body?.message
  if (Array.isArray(message) && message.length > 0) return message
  if (typeof message === 'string' && message) return [message]
  return [defaultMessage(status)]
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options

  // Build "?a=1&b=2", skipping empty values so the API applies its defaults
  const url = new URL(BASE_URL + path, window.location.origin)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  // Sent automatically once a token exists (Part 10 stores it after login)
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // fetch() only throws when there is no answer at all (server down, no network)
    throw new ApiError(0, [defaultMessage(0)])
  }

  // 204 No Content (e.g. DELETE): nothing to parse
  if (res.status === 204) return undefined as T

  const data: unknown = await res.json().catch(() => null)
  // fetch() does NOT throw on 4xx/5xx, so we check ourselves
  if (!res.ok) throw new ApiError(res.status, toMessages(data as NestErrorBody | null, res.status))
  return data as T
}
