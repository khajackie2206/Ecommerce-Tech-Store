## Mục tiêu

Nối web với phần đăng ký/đăng nhập của Phần 7:

| URL | Trang |
|---|---|
| `/dang-ky` | Đăng ký (họ tên, email, số điện thoại tuỳ chọn, mật khẩu, nhập lại mật khẩu). Thành công thì đăng nhập luôn |
| `/dang-nhap` | Đăng nhập. Hiện đúng thông báo lỗi của API (400, 401, 409) |
| `/tai-khoan` | Thông tin tài khoản. **Cần đăng nhập**: chưa đăng nhập thì bị chuyển sang `/dang-nhap?redirect=%2Ftai-khoan`, đăng nhập xong quay lại |

Header hiện "Chào, <họ tên>" + "Đăng xuất" khi đã đăng nhập. Tải lại trang vẫn còn đăng nhập. Token hết hạn hoặc sai thì tự đăng xuất.

**Làm sau:** task "API client chung và TanStack Query" (Phần 9) và cả Phần 7 phía server (đăng ký, đăng nhập, `GET /auth/me`). Task "Giỏ hàng" làm sau task này.

**Đọc trước:** https://react.dev/learn/passing-data-deeply-with-context; nhắc lại task "Đăng ký và đăng nhập bằng JWT" (Phần 7) để nhớ API trả gì.

## Luồng đăng nhập phía trình duyệt

```
Đăng nhập  →  POST /auth/login  →  { accessToken, user }
           →  lưu accessToken vào localStorage, lưu user vào cache
Mọi request sau  →  lib/api.ts tự gắn "Authorization: Bearer <token>"
Tải lại trang    →  đọc token trong localStorage  →  GET /auth/me  →  biết là ai
API trả 401 cho request có token (hết hạn, bị khoá)  →  xoá token, coi như đã đăng xuất
```

**Context là gì?** Nhiều component cần biết "ai đang đăng nhập": header, trang tài khoản, trang thanh toán... Truyền `user` qua props từ trên xuống từng tầng rất mệt. **Context** cho phép một component cha (`AuthProvider`) "phát" một giá trị, và **mọi** component con ở bất kỳ độ sâu nào đọc được bằng `useAuth()`. Giống một biến toàn cục, nhưng khi giá trị đổi thì các component đang đọc được vẽ lại.

**Lưu token ở `localStorage` có an toàn không?** Đủ cho dự án học, và là cách phổ biến. Điểm yếu: nếu trang bị chèn JavaScript lạ (lỗi XSS), đoạn script đó đọc được token. Cách chặt chẽ hơn là cookie `httpOnly` do server đặt (JavaScript không đọc được), đổi lại phải xử lý CSRF. React mặc định đã escape mọi chuỗi trong JSX nên XSS khó xảy ra; đừng dùng `dangerouslySetInnerHTML` với dữ liệu người dùng.

## Bước 1: `lib/api.ts` xử lý 401

Trong `web/src/lib/api.ts`, thêm ngay dưới dòng `export const TOKEN_KEY = ...`:

```ts
// Called when the API rejects our token (expired, account locked...).
// AuthProvider registers a handler that logs the user out of the UI.
let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}
```

và ngay trước dòng `const data: unknown = await res.json()...`:

```ts
  // We sent a token and the API says 401: the token is no longer valid.
  // Forget it, so the user is shown as logged out instead of seeing errors everywhere.
  if (res.status === 401 && token) {
    localStorage.removeItem(TOKEN_KEY)
    onUnauthorized()
  }
```

File hoàn chỉnh:

```ts
// One place for every call to the NestJS API.
// In development Vite forwards /api to localhost:3000 (vite.config.ts);
// in Docker nginx does the same (nginx.conf). So the browser only ever sees /api/v1.
const BASE_URL = '/api/v1'

// Login token storage key (written by AuthProvider after login)
export const TOKEN_KEY = 'techstore_token'

// Called when the API rejects our token (expired, account locked...).
// AuthProvider registers a handler that logs the user out of the UI.
let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

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

  // We sent a token and the API says 401: the token is no longer valid.
  // Forget it, so the user is shown as logged out instead of seeing errors everywhere.
  if (res.status === 401 && token) {
    localStorage.removeItem(TOKEN_KEY)
    onUnauthorized()
  }

  const data: unknown = await res.json().catch(() => null)
  // fetch() does NOT throw on 4xx/5xx, so we check ourselves
  if (!res.ok) throw new ApiError(res.status, toMessages(data as NestErrorBody | null, res.status))
  return data as T
}
```

Chỉ xử lý khi request **có gửi token**: đăng nhập sai mật khẩu cũng trả 401, nhưng lúc đó chưa có token nên không đụng gì.

## Bước 2: Kiểu `User`

Trong `web/src/lib/types.ts`, thêm hai kiểu sau (đặt trước `ProductDetail`):

```ts
// GET /auth/me (User entity; passwordHash never leaves the server)
export type User = {
  id: string
  email: string
  fullName: string
  phone: string | null
  role: 'customer' | 'admin'
  isActive: boolean
  createdAt: string
}

// POST /auth/login and /auth/register
export type AuthResponse = {
  accessToken: string
  user: User
}
```

`createdAt` là `string`: JSON không có kiểu ngày, API gửi chuỗi ISO (`"2026-11-11T14:43:54.195Z"`). Cần hiển thị thì `new Date(user.createdAt)`.

## Bước 3: Context và `useAuth()`

Tạo `web/src/auth/auth-context.ts`:

```ts
import { createContext, useContext } from 'react'
import type { User } from '../lib/types.ts'

export type RegisterInput = {
  email: string
  password: string
  fullName: string
  phone?: string
}

// What any component can read with useAuth()
export type AuthState = {
  user: User | null // null = not logged in
  isLoading: boolean // true while checking a saved token with GET /auth/me
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => void
}

// The "channel" AuthProvider broadcasts on. Kept in its own file (not in
// AuthProvider.tsx) so that file exports only components: fast refresh needs that.
export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth() must be used inside <AuthProvider>')
  return value
}
```

- `createContext(null)`: tạo "kênh" chia sẻ. Giá trị thật do `AuthProvider` đặt vào.
- `useAuth()` ném lỗi rõ ràng nếu quên bọc `<AuthProvider>`, thay vì nhận `null` rồi lỗi ở chỗ khác khó hiểu.
- Context và hook nằm file `.ts` riêng, file `AuthProvider.tsx` chỉ export component. Vite chỉ "hot reload" giữ được state cho file chỉ export component (lint có rule `only-export-components` nhắc điều này).

## Bước 4: `AuthProvider`

Tạo `web/src/auth/AuthProvider.tsx`:

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler, TOKEN_KEY } from '../lib/api.ts'
import type { AuthResponse, User } from '../lib/types.ts'
import { AuthContext, type AuthState, type RegisterInput } from './auth-context.ts'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  // Survives a page reload: the token saved at the last login
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))

  // Who is logged in? Only asked when there is a token.
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('/auth/me'),
    enabled: token !== null,
    staleTime: Infinity, // the profile does not change by itself
    retry: false,
  })

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    queryClient.removeQueries({ queryKey: ['me'] })
  }

  // lib/api.ts calls this when the API answers 401 to a request that carried our token
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null)
      queryClient.removeQueries({ queryKey: ['me'] })
    })
  }, [queryClient])

  function saveSession(response: AuthResponse) {
    localStorage.setItem(TOKEN_KEY, response.accessToken)
    // We already have the user from the response: put it in the cache, no extra request
    queryClient.setQueryData(['me'], response.user)
    setToken(response.accessToken)
  }

  const value: AuthState = {
    user: token ? (me.data ?? null) : null,
    isLoading: token !== null && me.isPending,
    login: async (email, password) => {
      saveSession(await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }))
    },
    register: async (input: RegisterInput) => {
      saveSession(await api<AuthResponse>('/auth/register', { method: 'POST', body: input }))
    },
    logout: clearSession,
  }

  return <AuthContext value={value}>{children}</AuthContext>
}
```

Giải thích:
- `useState(() => localStorage.getItem(TOKEN_KEY))`: đọc token đã lưu **một lần** khi app khởi động.
- `useQuery(['me'])` với `enabled: token !== null`: có token mới hỏi `GET /auth/me`. Không có token thì query nằm yên.
- `saveSession`: đăng nhập/đăng ký trả sẵn `user`, ta đặt thẳng vào cache bằng `setQueryData(['me'], ...)` nên không phải gọi thêm `/auth/me`.
- `isLoading`: đang kiểm tra token đã lưu. Trang cần đăng nhập phải **chờ** bước này, nếu không người đã đăng nhập bị đá sang trang đăng nhập trong tích tắc khi F5.
- `useEffect(() => setUnauthorizedHandler(...), [queryClient])`: đăng ký hàm mà `api.ts` gọi khi gặp 401 (Bước 1).
- `<AuthContext value={value}>`: React 19 cho dùng thẳng context làm provider (bản cũ phải viết `<AuthContext.Provider value=...>`).

## Bước 5: Bọc trang cần đăng nhập

Tạo `web/src/auth/RequireAuth.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from './auth-context.ts'

// Wrap a page that needs login: <RequireAuth><AccountPage /></RequireAuth>
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  // A saved token is being checked: wait instead of bouncing to the login page
  if (isLoading) return <p className="py-16 text-center text-slate-500">Đang tải...</p>

  if (!user) {
    // Remember where the user wanted to go, and come back after login
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/dang-nhap?redirect=${redirect}`} replace />
  }

  return children
}
```

- `<Navigate to=... replace />`: chuyển trang ngay khi vẽ. `replace` thay mục hiện tại trong lịch sử, nên bấm Back không quay lại trang bị chặn rồi lại bị đá đi.
- `redirect=` giữ đường dẫn người dùng muốn vào, để đăng nhập xong quay lại đúng chỗ.
- Đây chỉ là **trải nghiệm người dùng**. Bảo mật thật nằm ở API (AuthGuard, Phần 7): ai sửa code JavaScript để vào trang vẫn không lấy được dữ liệu vì API trả 401.

## Bước 6: Đăng nhập, đăng ký, tài khoản

Tạo `web/src/lib/redirect.ts`:

```ts
// Only follow redirects inside our own site ("/gio-hang"), never "//evil.com" or "https://...".
// Otherwise a link like /dang-nhap?redirect=https://evil.com could send users to a fake site.
export function safeRedirect(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}
```

Đây là lỗ hổng **open redirect**: kẻ xấu gửi link `/dang-nhap?redirect=https://trang-gia.com` thật trông như của TechStore; nạn nhân đăng nhập xong bị đưa sang trang giả để lừa nhập lại mật khẩu. Chỉ chấp nhận đường dẫn bắt đầu bằng **một** dấu `/`.

Tạo `web/src/components/FormErrors.tsx`:

```tsx
// List of error messages above a form. 400 errors from the API can carry several.
export default function FormErrors({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null
  return (
    <ul role="alert" className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  )
}
```

Tạo `web/src/pages/LoginPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/auth-context.ts'
import FormErrors from '../components/FormErrors.tsx'
import { ApiError } from '../lib/api.ts'
import { safeRedirect } from '../lib/redirect.ts'

const INPUT = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-amber-500'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = safeRedirect(searchParams.get('redirect'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Already logged in (e.g. pressed Back after logging in): nothing to do here
  if (user) return <Navigate to={redirect} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors([])
    setSubmitting(true)
    try {
      await login(email, password)
      navigate(redirect, { replace: true })
    } catch (error) {
      setErrors(error instanceof ApiError ? error.messages : ['Có lỗi xảy ra, vui lòng thử lại'])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto max-w-sm rounded-2xl bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold">Đăng nhập</h1>
      {/* noValidate: let the API validate, so we see its messages while learning */}
      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
        <FormErrors messages={errors} />
        <label className="block text-sm">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} autoComplete="email" />
        </label>
        <label className="block text-sm">
          Mật khẩu
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT}
            autoComplete="current-password"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-amber-400 py-2 font-semibold hover:bg-amber-500 disabled:opacity-50"
        >
          {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Chưa có tài khoản?{' '}
        <Link to={`/dang-ky?redirect=${encodeURIComponent(redirect)}`} className="text-amber-700 underline">
          Đăng ký
        </Link>
      </p>
    </section>
  )
}
```

Tạo `web/src/pages/RegisterPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/auth-context.ts'
import FormErrors from '../components/FormErrors.tsx'
import { ApiError } from '../lib/api.ts'
import { safeRedirect } from '../lib/redirect.ts'

const INPUT = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-amber-500'

export default function RegisterPage() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = safeRedirect(searchParams.get('redirect'))

  // One state object for the whole form; update(field) returns an onChange handler
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const update = (field: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm({ ...form, [field]: event.target.value })

  if (user) return <Navigate to={redirect} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // The API does not know about "confirm": that check belongs to the form
    if (form.password !== form.confirm) {
      setErrors(['Mật khẩu nhập lại không khớp'])
      return
    }
    setErrors([])
    setSubmitting(true)
    try {
      await register({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        // Optional: send nothing rather than "" (the API would reject an empty phone)
        phone: form.phone.trim() || undefined,
      })
      navigate(redirect, { replace: true })
    } catch (error) {
      setErrors(error instanceof ApiError ? error.messages : ['Có lỗi xảy ra, vui lòng thử lại'])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto max-w-sm rounded-2xl bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold">Đăng ký tài khoản</h1>
      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
        <FormErrors messages={errors} />
        <label className="block text-sm">
          Họ tên
          <input value={form.fullName} onChange={update('fullName')} className={INPUT} autoComplete="name" />
        </label>
        <label className="block text-sm">
          Email
          <input type="email" value={form.email} onChange={update('email')} className={INPUT} autoComplete="email" />
        </label>
        <label className="block text-sm">
          Số điện thoại (không bắt buộc)
          <input type="tel" value={form.phone} onChange={update('phone')} className={INPUT} autoComplete="tel" />
        </label>
        <label className="block text-sm">
          Mật khẩu (ít nhất 8 ký tự, có chữ và số)
          <input
            type="password"
            value={form.password}
            onChange={update('password')}
            className={INPUT}
            autoComplete="new-password"
          />
        </label>
        <label className="block text-sm">
          Nhập lại mật khẩu
          <input
            type="password"
            value={form.confirm}
            onChange={update('confirm')}
            className={INPUT}
            autoComplete="new-password"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-amber-400 py-2 font-semibold hover:bg-amber-500 disabled:opacity-50"
        >
          {submitting ? 'Đang tạo tài khoản...' : 'Đăng ký'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Đã có tài khoản?{' '}
        <Link to={`/dang-nhap?redirect=${encodeURIComponent(redirect)}`} className="text-amber-700 underline">
          Đăng nhập
        </Link>
      </p>
    </section>
  )
}
```

Tạo `web/src/pages/AccountPage.tsx`:

```tsx
import { useAuth } from '../auth/auth-context.ts'

// Protected page: App.tsx wraps it in <RequireAuth>, so user is never null here
export default function AccountPage() {
  const { user, logout } = useAuth()
  if (!user) return null

  const rows = [
    ['Họ tên', user.fullName],
    ['Email', user.email],
    ['Số điện thoại', user.phone ?? 'Chưa cập nhật'],
    ['Vai trò', user.role === 'admin' ? 'Quản trị viên' : 'Khách hàng'],
    ['Ngày tạo', new Date(user.createdAt).toLocaleDateString('vi-VN')],
  ]

  return (
    <section className="mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold">Tài khoản của tôi</h1>
      <dl className="mt-4 divide-y divide-slate-100 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between py-2">
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={logout} className="mt-6 text-sm text-red-600 underline">
        Đăng xuất
      </button>
    </section>
  )
}
```

Giải thích:
- `error instanceof ApiError ? error.messages : [...]`: lỗi từ API đã có sẵn danh sách thông báo tiếng Việt (Phần 7 viết trong DTO và AuthService), form chỉ việc hiện ra.
- `noValidate` trên `<form>`: tắt kiểm tra có sẵn của trình duyệt (như `type="email"`) để thấy thông báo của API khi học. Làm thật thì nên **kiểm tra cả hai phía**: trình duyệt cho phản hồi nhanh, server mới là nơi quyết định.
- "Nhập lại mật khẩu" chỉ kiểm tra ở form: API không biết field này (gửi lên còn bị 400 "property confirm should not exist").
- `phone: form.phone.trim() || undefined`: không nhập thì không gửi, vì API từ chối chuỗi rỗng ("Số điện thoại phải gồm 10 số, bắt đầu bằng 0").
- `update(field)` trả về một hàm xử lý `onChange`: một state object cho cả form thay vì 5 `useState`.
- `if (user) return <Navigate ... />`: đã đăng nhập mà mở `/dang-nhap` thì chuyển đi luôn.

## Bước 7: Nối vào app

Thay toàn bộ `web/src/App.tsx` (thêm 3 route):

```tsx
import { Route, Routes } from 'react-router'
import RequireAuth from './auth/RequireAuth.tsx'
import Layout from './components/Layout.tsx'
import AccountPage from './pages/AccountPage.tsx'
import HomePage from './pages/HomePage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'
import ProductDetailPage from './pages/ProductDetailPage.tsx'
import ProductListPage from './pages/ProductListPage.tsx'
import RegisterPage from './pages/RegisterPage.tsx'

// URL -> page. Every route sits inside <Layout>, so all pages share the header and footer.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="san-pham" element={<ProductListPage />} />
        <Route path="san-pham/:slug" element={<ProductDetailPage />} />
        <Route path="dang-nhap" element={<LoginPage />} />
        <Route path="dang-ky" element={<RegisterPage />} />
        {/* Logged-in users only: others are sent to /dang-nhap?redirect=/tai-khoan */}
        <Route
          path="tai-khoan"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        />
        {/* "*" matches any URL not listed above */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
```

Thay toàn bộ `web/src/main.tsx` (bọc `AuthProvider`):

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import AuthProvider from './auth/AuthProvider.tsx'
import { ApiError } from './lib/api.ts'

// Cache + request manager shared by the whole app
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data counts as fresh for 30s: switching pages back and forth reuses it
      staleTime: 30_000,
      // Retry network/server errors once, never 4xx (a 404 will not fix itself)
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
        failureCount < 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Who is logged in: available to every component through useAuth() */}
      <AuthProvider>
        {/* Lets every component read and change the URL (<Link>, useParams, useNavigate...) */}
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
```

`AuthProvider` nằm **trong** `QueryClientProvider` vì nó dùng `useQuery`.

Thay toàn bộ `web/src/components/Header.tsx` (hiện tên + Đăng xuất, hoặc link Đăng nhập):

```tsx
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/auth-context.ts'
import { useCategories } from '../lib/queries.ts'

export default function Header() {
  const { user, logout } = useAuth()
  // Cached by TanStack Query: other components asking for categories reuse this result
  const { data: categories = [] } = useCategories()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '')

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault() // stop the browser from reloading the whole page
    const q = keyword.trim()
    navigate(q ? `/san-pham?q=${encodeURIComponent(q)}` : '/san-pham')
  }

  // Highlight the menu item that matches the current list filter
  const onListPage = location.pathname === '/san-pham'
  const activeCategory = onListPage ? searchParams.get('category') : undefined

  return (
    <header className="bg-amber-400 shadow">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Link to="/" className="text-2xl font-extrabold tracking-tight text-slate-900">
          TechStore
        </Link>

        <form onSubmit={handleSearch} className="order-last w-full sm:order-none sm:flex-1">
          <input
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Bạn tìm gì hôm nay?"
            className="w-full rounded-full bg-white px-4 py-2 text-sm outline-none ring-amber-600 focus:ring-2"
          />
        </form>

        <div className="ml-auto flex items-center gap-4 text-sm font-medium text-slate-900">
          {user ? (
            <>
              <Link to="/tai-khoan" className="hover:underline">
                Chào, {user.fullName}
              </Link>
              <button type="button" onClick={logout} className="hover:underline">
                Đăng xuất
              </button>
            </>
          ) : (
            <Link to="/dang-nhap" className="hover:underline">
              Đăng nhập
            </Link>
          )}
          {/* Placeholder: the cart task replaces it */}
          <span className="opacity-60" title="Có ở task Giỏ hàng">
            Giỏ hàng (0)
          </span>
        </div>
      </div>

      <nav className="bg-amber-300">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 text-sm">
          <Link
            to="/san-pham"
            className={`whitespace-nowrap px-3 py-2 ${activeCategory === null ? 'font-semibold' : ''}`}
          >
            Tất cả
          </Link>
          {categories.map((category) => (
            <Link
              key={category.id}
              to={`/san-pham?category=${category.slug}`}
              className={`whitespace-nowrap px-3 py-2 ${
                activeCategory === category.slug ? 'font-semibold underline' : ''
              }`}
            >
              {category.name}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  )
}
```

`<>...</>` (Fragment): nhóm nhiều phần tử mà không thêm thẻ `<div>` thừa vào HTML.

## Bước 8: Chạy thử

1. Mở http://localhost:5173/tai-khoan: bị chuyển sang `/dang-nhap?redirect=%2Ftai-khoan`.
2. Bấm "Đăng ký", để trống họ tên, email `bad`, số điện thoại `123`, mật khẩu `abcdefgh` (cả hai ô): hộp lỗi liệt kê
   - Email không hợp lệ
   - Mật khẩu phải có cả chữ và số
   - Họ tên không được để trống
   - Số điện thoại phải gồm 10 số, bắt đầu bằng 0
3. Hai ô mật khẩu khác nhau: "Mật khẩu nhập lại không khớp" (không gửi lên API).
4. Điền đúng, bỏ trống số điện thoại: quay về `/tai-khoan`, header "Chào, <họ tên>".
5. F5: vẫn đăng nhập. DevTools → Application → Local Storage: có `techstore_token`. Dán token vào https://jwt.io để xem `sub`, `email`, `role`.
6. Đăng xuất rồi đăng ký lại cùng email: "Email đã được đăng ký" (409).
7. Đăng nhập sai mật khẩu: "Email hoặc mật khẩu không đúng" (401).
8. Mở `/dang-nhap?redirect=//evil.example`, đăng nhập đúng: về trang chủ `/`, không đi sang trang lạ.
9. Trong Console: `localStorage.setItem('techstore_token', 'abc.def.ghi')`, rồi mở `/tai-khoan`: `/auth/me` trả 401, token bị xoá, bạn được đưa sang trang đăng nhập.

## Kiểm tra

- [ ] `npm run lint` và `npm run build` trong `web/` đều qua
- [ ] Đăng ký, đăng nhập, đăng xuất chạy đúng; F5 vẫn giữ đăng nhập
- [ ] Thông báo lỗi 400/401/409 hiện đúng chữ của API; redirect lạ bị bỏ qua
- [ ] Token sai/hết hạn → tự đăng xuất, không kẹt ở màn hình lỗi
- [ ] Giải thích được: Context giải quyết vấn đề gì; vì sao `RequireAuth` phải chờ `isLoading`; vì sao chặn ở web chưa phải là bảo mật
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Đặt `JWT_EXPIRES_IN=60` trong `.env`, khởi động lại API, đăng nhập rồi đợi hơn 1 phút và F5 trang `/tai-khoan`: tự bị đưa về đăng nhập. Nhớ trả lại `86400`.
2. Nâng tài khoản của bạn thành admin (`npm run db:promote-admin`, Phần 7), đăng xuất rồi đăng nhập lại: trang tài khoản ghi "Quản trị viên". Thêm vào header một link "Quản trị" chỉ hiện khi `user.role === 'admin'` (Phần 12 sẽ dùng).
