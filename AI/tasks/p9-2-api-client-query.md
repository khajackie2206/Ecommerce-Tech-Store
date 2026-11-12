## Mục tiêu

Dựng "đường ống" mà mọi trang React dùng để nói chuyện với API:

| File | Việc của nó |
|---|---|
| `src/lib/api.ts` | Hàm `api()` duy nhất gọi API: gắn `/api/v1`, gửi/nhận JSON, đổi lỗi của NestJS thành `ApiError` có thông báo tiếng Việt, tự gửi token đăng nhập khi có |
| `src/lib/types.ts` | Kiểu TypeScript cho JSON mà API trả về |
| `src/lib/format.ts` | `formatPrice(1990000)` → `1.990.000 ₫` |
| `src/lib/queries.ts` | Các hook `useCategories()`, `useBrands()`, `useProducts()`, `useProduct()` dùng **TanStack Query** |

Header và footer chuyển sang dùng các hook này. Từ task sau, trang nào cần dữ liệu chỉ cần một dòng `const { data } = useProducts(...)`.

**Làm sau:** task "Layout cửa hàng và React Router". Ba task trang (Trang chủ, Danh sách, Chi tiết) đều cần task này, nên merge sớm.

**Đọc trước:** https://tanstack.com/query/latest/docs/framework/react/overview và mục "Quick Start".

## Vì sao không gọi `fetch` thẳng trong mỗi component?

Ở task trước, Header tự `fetch` trong `useEffect`. Làm vậy cho mọi trang sẽ gặp:
- Lặp code: ghép URL, `res.ok`, `res.json()`, bắt lỗi... ở mọi nơi.
- Mỗi component tự quản lý `loading`, `error`, `data` bằng 3 state.
- Không có **cache**: rời trang rồi quay lại là gọi API lại từ đầu, màn hình nhấp nháy.
- Hai component cùng cần danh mục thì gọi **hai** request giống hệt nhau.
- Lỗi khó thấy: người dùng đổi bộ lọc nhanh, request cũ về **sau** request mới và ghi đè kết quả (race condition).

Giải pháp có hai lớp:
1. **`api()`**: một hàm gói `fetch`, xử lý chung URL, JSON, lỗi, token. Giống một "HTTP client" trong PHP (Guzzle).
2. **TanStack Query**: thư viện quản lý dữ liệu lấy từ server. Ta chỉ khai báo "dữ liệu này tên là gì (`queryKey`) và lấy bằng cách nào (`queryFn`)"; thư viện lo loading, lỗi, cache, gộp request trùng, thử lại.

## Bước 1: Cài thư viện

```powershell
cd web
npm install @tanstack/react-query
```

## Bước 2: Hàm gọi API

Tạo `web/src/lib/api.ts`:

```ts
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
```

Giải thích:
- `BASE_URL = '/api/v1'`: đường dẫn tương đối, không ghi `http://localhost:3000`. Lúc dev Vite chuyển `/api` sang cổng 3000 (`vite.config.ts`), trong Docker nginx làm việc đó. Nhờ vậy cùng một code chạy được ở cả hai nơi, và không cần cấu hình CORS.
- `fetch()` **không** ném lỗi khi server trả 4xx/5xx; nó chỉ ném khi không có phản hồi (mất mạng, API tắt). Vì vậy phải tự kiểm tra `res.ok`.
- Mọi lỗi của NestJS có dạng `{ message, error, statusCode }`. `message` là chuỗi, hoặc **mảng chuỗi** với lỗi validation 400. `toMessages()` luôn trả về mảng, để form hiện được từng dòng.
- `class ApiError extends Error`: có thêm `status` và `messages`. Trang chi tiết sẽ dùng `error.status === 404` để hiện trang "không tìm thấy".
- Hai field được khai báo rồi gán trong constructor (không viết `constructor(public status: number)`): cấu hình `erasableSyntaxOnly` của dự án chỉ cho cú pháp TypeScript mà khi bỏ đi vẫn là JavaScript hợp lệ.
- Token: nếu `localStorage` có `techstore_token` thì gửi header `Authorization: Bearer ...`. Hiện chưa ai lưu token, Phần 10 (đăng nhập) sẽ lưu.
- `params`: bỏ qua giá trị rỗng, để API dùng giá trị mặc định thay vì nhận `?q=` rỗng.

## Bước 3: Kiểu dữ liệu và định dạng giá

Tạo `web/src/lib/types.ts`:

```ts
// Shapes of the JSON the API returns (see the entities and services in server/src)

export type Category = {
  id: number
  name: string
  slug: string
  sortOrder: number
  isActive: boolean
}

export type Brand = {
  id: number
  name: string
  slug: string
  logoUrl: string | null
  isActive: boolean
}

// One row of GET /products (ProductListItem in products.service.ts)
export type ProductListItem = {
  id: number
  name: string
  slug: string
  shortDescription: string | null
  thumbnailUrl: string | null
  isFeatured: boolean
  category: { name: string; slug: string }
  brand: { name: string; slug: string }
  fromPrice: number // cheapest price after discount
  listPrice: number // cheapest original price
  inStock: boolean
}

export type ProductListResult = {
  items: ProductListItem[]
  total: number
  page: number
  limit: number
}

export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'name_asc'

// Query string accepted by GET /products (ListProductsQueryDto)
export type ProductListParams = {
  category?: string
  brand?: string
  q?: string
  minPrice?: number
  maxPrice?: number
  featured?: boolean
  sort?: ProductSort
  page?: number
  limit?: number
}

export type ProductVariant = {
  id: number
  sku: string
  name: string // e.g. "256GB - Cam vũ trụ"
  color: string | null
  storage: string | null
  price: number
  salePrice: number | null
  stock: number
}

export type ProductImage = {
  id: number
  url: string
  sortOrder: number
}

// GET /products/:slug
export type ProductDetail = {
  id: number
  name: string
  slug: string
  shortDescription: string | null
  description: string | null
  specs: Record<string, string> | null
  thumbnailUrl: string | null
  category: Category
  brand: Brand
  variants: ProductVariant[]
  images: ProductImage[]
}
```

Các kiểu này chép theo entity và service bên `server/` (ví dụ `ProductListItem` trong `products.service.ts`). TypeScript không kiểm tra JSON thật lúc chạy: nếu API đổi field mà quên sửa ở đây, chỉ phát hiện khi trang hiện sai. Hai bên phải sửa cùng lúc.

Tạo `web/src/lib/format.ts`:

```ts
// Created once and reused: building an Intl formatter is relatively slow
const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

// 1990000 -> "1.990.000 ₫"
export function formatPrice(value: number): string {
  return vnd.format(value)
}
```

`Intl.NumberFormat` có sẵn trong trình duyệt, định dạng theo chuẩn Việt Nam. Ký tự trước `₫` là **khoảng trắng không ngắt dòng** (non-breaking space), để số và `₫` không bị tách xuống hai dòng; nhớ điều này khi so sánh chuỗi giá trong test.

## Bước 4: Các hook lấy dữ liệu

Tạo `web/src/lib/queries.ts`:

```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from './api.ts'
import type {
  Brand,
  Category,
  ProductDetail,
  ProductListParams,
  ProductListResult,
} from './types.ts'

// Each hook = one API endpoint. The queryKey is the cache key:
// two components asking for the same key share ONE request and ONE cached result.

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories'),
    // Categories rarely change: reuse them for 5 minutes without asking again
    staleTime: 5 * 60_000,
    select: (categories) => categories.filter((category) => category.isActive),
  })
}

export function useBrands() {
  return useQuery({
    queryKey: ['brands'],
    queryFn: () => api<Brand[]>('/brands'),
    staleTime: 5 * 60_000,
    select: (brands) => brands.filter((brand) => brand.isActive),
  })
}

export function useProducts(params: ProductListParams) {
  return useQuery({
    // Different filters -> different cache entries
    queryKey: ['products', params],
    queryFn: () => api<ProductListResult>('/products', { params }),
    // Keep showing the previous page while the next one loads (no flicker)
    placeholderData: keepPreviousData,
  })
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: ['product', slug],
    queryFn: () => api<ProductDetail>(`/products/${slug}`),
  })
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api<{ status: 'ok' | 'error'; database: 'up' | 'down' }>('/health'),
    retry: false,
  })
}
```

Giải thích:
- `useQuery({ queryKey, queryFn })` trả về `{ data, isPending, isError, error, refetch, ... }`. Component chỉ cần đọc các giá trị đó.
- `queryKey` là **khoá cache**. `['products', { category: 'laptop' }]` và `['products', { category: 'tablet' }]` là hai mục cache khác nhau. Header và trang chủ cùng gọi `useCategories()` → **một** request, dùng chung kết quả.
- `staleTime: 5 * 60_000`: danh mục được coi là "còn mới" 5 phút, trong thời gian đó không hỏi lại API.
- `select`: lọc dữ liệu trước khi trả cho component (bỏ danh mục `isActive = false`). Cache vẫn giữ bản đầy đủ.
- `placeholderData: keepPreviousData`: khi đổi bộ lọc/trang, vẫn hiện kết quả cũ cho tới khi kết quả mới về, thay vì màn hình trống.

## Bước 5: Bật TanStack Query cho cả app

Thay toàn bộ `web/src/main.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
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
      {/* Lets every component read and change the URL (<Link>, useParams, useNavigate...) */}
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
```

- `QueryClient` giữ toàn bộ cache. `QueryClientProvider` đưa nó cho mọi component bên trong, giống cách `BrowserRouter` đưa URL.
- `retry`: mặc định thư viện thử lại 3 lần mọi lỗi. Lỗi 4xx (404, 400) thử lại cũng vô ích, nên chỉ thử lại lỗi mạng/5xx một lần.
- `refetchOnWindowFocus: false`: không tự gọi lại API mỗi khi quay lại tab. Bật thì dữ liệu luôn mới, nhưng khi học sẽ thấy request "tự nhiên" xuất hiện, dễ rối.

## Bước 6: Header và footer dùng hook

Trong `web/src/components/Header.tsx`: xoá `type Category`, đoạn `useState<Category[]>` và cả khối `useEffect` gọi `fetch`, thay bằng một dòng dùng hook. File hoàn chỉnh:

```tsx
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useCategories } from '../lib/queries.ts'

export default function Header() {
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
          {/* Placeholders: login and the cart are built in Part 10 */}
          <span className="opacity-60" title="Có ở Phần 10">
            Đăng nhập
          </span>
          <span className="opacity-60" title="Có ở Phần 10">
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

`const { data: categories = [] } = useCategories()`: lấy `data` và đặt tên là `categories`, mặc định `[]` khi chưa có dữ liệu.

Thay toàn bộ `web/src/components/Footer.tsx`:

```tsx
import { useHealth } from '../lib/queries.ts'

// The Part 1 status check lives on as a small line in the footer
export default function Footer() {
  // isPending: still loading; isError: request failed (API down -> 503 or no answer)
  const { data, isPending, isError } = useHealth()
  const dbUp = isPending ? null : !isError && data.database === 'up'

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-4 text-xs text-slate-500">
        <p>© TechStore - dự án học NestJS + SQL Server + React</p>
        <p>
          SQL Server:{' '}
          {dbUp === null && 'đang kiểm tra...'}
          {dbUp === true && <span className="text-emerald-700">đã kết nối</span>}
          {dbUp === false && <span className="text-red-600">không kết nối được</span>}
        </p>
      </div>
    </footer>
  )
}
```

Khi API trả 503 (database tắt), `api()` ném `ApiError` nên `isError` là `true`: footer báo "không kết nối được" mà không cần tự kiểm tra status.

## Bước 7: Gọi thử ngay trong trình duyệt

Chạy `npm run dev`, mở http://localhost:5173, mở DevTools → **Console**. Lúc dev, Vite phục vụ từng file nguồn, nên có thể import thẳng `api.ts`:

```js
const { api } = await import('/src/lib/api.ts')

await api('/products', { params: { category: 'laptop', limit: 2 } })
// { items: [...2 sản phẩm], total: 9, page: 1, limit: 2 }

await api('/products/khong-co').catch((e) => [e.status, e.message])
// [404, 'Not found khong-co']   (câu chữ lấy từ NotFoundException trong ProductsService)

await api('/products', { params: { minPrice: -1, sort: 'x' } }).catch((e) => e.messages)
// ['minPrice cannot be negative', 'sort: newest, price_asc, price_desc, name_asc']

await api('/auth/me').catch((e) => e.message)
// 'Bạn cần đăng nhập'   (route cần token, Phần 7)

const { formatPrice } = await import('/src/lib/format.ts')
formatPrice(1990000)   // '1.990.000 ₫'
```

Các câu thông báo lỗi lấy nguyên từ API (các DTO, service bên `server/`); câu nào đang tiếng Anh thì sửa ở phía server.

Thử cache: mở tab **Network**, lọc `categories`, bấm qua lại các mục menu và trang chủ: chỉ có **một** request `categories`.

## Kiểm tra

- [ ] `npm run lint` và `npm run build` trong `web/` đều qua
- [ ] Menu, footer vẫn chạy như task trước; Network chỉ có một request `categories` khi chuyển trang
- [ ] Các lệnh ở Bước 7 cho đúng kết quả (404 → `ApiError` có `status` 404, lỗi 400 → mảng thông báo)
- [ ] Giải thích được: `queryKey` dùng để làm gì; vì sao `fetch` cần tự kiểm tra `res.ok`; vì sao URL API không ghi `localhost:3000`
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Cài công cụ xem cache: `npm install -D @tanstack/react-query-devtools`, thêm `<ReactQueryDevtools />` (import từ `@tanstack/react-query-devtools`) ngay trong `<QueryClientProvider>`. Một nút nhỏ xuất hiện ở góc màn hình, bấm vào để xem từng `queryKey`, trạng thái fresh/stale và dữ liệu.
2. Trong Console, đặt một token rởm rồi gọi hai API:

   ```js
   localStorage.setItem('techstore_token', 'abc.def.ghi')
   await api('/categories')                          // vẫn 200
   await api('/auth/me').catch((e) => e.message)     // 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn'
   localStorage.removeItem('techstore_token')
   ```

   Route `@Public()` không hề kiểm tra token (AuthGuard cho qua ngay), route cần đăng nhập thì có. Giải thích dựa vào `auth.guard.ts` của Phần 7.
