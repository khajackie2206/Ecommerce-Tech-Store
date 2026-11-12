## Mục tiêu

Khách xem lại đơn đã đặt:

| URL | Trang |
|---|---|
| `/tai-khoan/don-hang?page=2` | Danh sách đơn, mới nhất trước, 10 đơn mỗi trang: mã đơn, ngày đặt, trạng thái, các sản phẩm, tổng tiền |
| `/tai-khoan/don-hang/TS...` | Chi tiết: người nhận, địa chỉ, thanh toán, từng dòng sản phẩm (giá lúc mua), tạm tính, phí giao, tổng. Đơn **đang chờ xác nhận** có nút "Huỷ đơn hàng" |

Trạng thái hiện bằng nhãn màu tiếng Việt (Chờ xác nhận, Đã xác nhận, Đang giao, Hoàn thành, Đã huỷ). Đăng xuất thì xoá đơn hàng khỏi cache, người dùng sau trên cùng máy không thấy được.

**Làm sau:** task "API lịch sử đơn hàng và huỷ đơn" (server) và task "Trang thanh toán và đặt hàng thành công" (dùng chung `lib/orders.ts`, `lib/types.ts`).

**Đọc trước:** nhắc lại `OrdersService.findMine`, `findMineByCode`, `cancelMine` (server); https://developer.mozilla.org/en-US/docs/Web/API/Window/confirm.

## Bước 1: Nhãn trạng thái

Tạo `web/src/lib/order-status.ts`:

```ts
import type { OrderStatus, PaymentMethod } from './types.ts'

// What the customer reads for each status stored in Orders.status
export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  shipping: 'Đang giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã huỷ',
}

// Tailwind colors of the status badge
export const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-sky-100 text-sky-800',
  shipping: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-200 text-slate-600',
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cod: 'Thanh toán khi nhận hàng',
  bank_transfer: 'Chuyển khoản',
}

// "2026-11-12T00:20:00Z" (UTC, as stored) -> "07:20 12/11/2026" (in the browser's time zone)
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
```

- `Record<OrderStatus, string>`: object phải có **đủ** 5 khoá của `OrderStatus`. Thiếu một trạng thái, hoặc server thêm trạng thái mới và sửa `OrderStatus`, TypeScript báo lỗi ngay.
- `formatDateTime`: API trả giờ UTC (`...Z`). `toLocaleString` đổi sang múi giờ của trình duyệt, máy ở Việt Nam sẽ thấy giờ Việt Nam.

Tạo `web/src/components/OrderStatusBadge.tsx`:

```tsx
import { STATUS_COLORS, STATUS_LABELS } from '../lib/order-status.ts'
import type { OrderStatus } from '../lib/types.ts'

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}
```

## Bước 2: Hook danh sách và huỷ đơn

Thay toàn bộ `web/src/lib/orders.ts`:

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api.ts'
import type { CreateOrderInput, Order, Paginated } from './types.ts'

// Orders of the logged-in customer (routes /orders of the API, all need a token)

export const ORDERS_PAGE_SIZE = 10

export function useMyOrders(page: number) {
  return useQuery({
    queryKey: ['orders', page],
    queryFn: () => api<Paginated<Order>>('/orders', { params: { page, limit: ORDERS_PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  })
}

export function useMyOrder(code: string) {
  return useQuery({
    queryKey: ['order', code],
    queryFn: () => api<Order>(`/orders/${code}`),
  })
}

// useMutation: for requests that CHANGE data (POST, PATCH, DELETE).
// Nothing runs until we call mutate(input) / mutateAsync(input).
export function useCreateOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateOrderInput) => api<Order>('/orders', { method: 'POST', body: input }),
    onSuccess: (order) => {
      // Stock changed: product lists and pages must be read again
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['product'] })
      // The history has a new first row
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      // We already have the new order: put it in the cache for the success page
      queryClient.setQueryData(['order', order.code], order)
    },
  })
}

export function useCancelOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => api<Order>(`/orders/${code}/cancel`, { method: 'PATCH' }),
    onSuccess: (order) => {
      queryClient.setQueryData(['order', order.code], order)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      // Cancelling gives the stock back
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['product'] })
    },
  })
}
```

Thay đổi so với task trước:
- `useMyOrders(page)`: khoá `['orders', page]`, mỗi trang một mục cache.
- `useCancelOrder()`: `PATCH /orders/:code/cancel`. Thành công thì đặt đơn mới (status `cancelled`) vào cache của trang chi tiết, và làm cũ danh sách đơn (`orders`) cùng sản phẩm (tồn kho được trả lại).
- `useCreateOrder` thêm `invalidateQueries({ queryKey: ['orders'] })`: đơn mới phải xuất hiện đầu lịch sử.

## Bước 3: Trang danh sách

Tạo `web/src/pages/OrderHistoryPage.tsx`:

```tsx
import { Link, useSearchParams } from 'react-router'
import ErrorBox from '../components/ErrorBox.tsx'
import OrderStatusBadge from '../components/OrderStatusBadge.tsx'
import Pagination from '../components/Pagination.tsx'
import { formatPrice } from '../lib/format.ts'
import { formatDateTime } from '../lib/order-status.ts'
import { ORDERS_PAGE_SIZE, useMyOrders } from '../lib/orders.ts'

// /tai-khoan/don-hang?page=2 (behind <RequireAuth>)
export default function OrderHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useMyOrders(page)

  return (
    <section className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Đơn hàng của tôi</h1>
        <Link to="/tai-khoan" className="text-sm text-amber-700 hover:underline">
          ‹ Tài khoản
        </Link>
      </div>

      {isPending && <div className="h-40 animate-pulse rounded-2xl bg-slate-200" aria-busy="true" />}
      {isError && <ErrorBox error={error} onRetry={() => refetch()} />}

      {data && data.total === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-slate-500">Bạn chưa có đơn hàng nào.</p>
          <Link to="/san-pham" className="mt-3 inline-block text-amber-700 underline">
            Bắt đầu mua sắm
          </Link>
        </div>
      )}

      {data && data.total > 0 && (
        <>
          <ul className={`space-y-3 ${isPlaceholderData ? 'opacity-50' : ''}`}>
            {data.items.map((order) => (
              <li key={order.id}>
                <Link
                  to={`/tai-khoan/don-hang/${order.code}`}
                  className="block rounded-2xl bg-white p-4 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-semibold">{order.code}</span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{formatDateTime(order.createdAt)}</p>
                  <p className="mt-2 line-clamp-1 text-sm">
                    {order.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ')}
                  </p>
                  <p className="mt-1 text-right font-semibold text-red-600">{formatPrice(order.total)}</p>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            totalPages={Math.ceil(data.total / ORDERS_PAGE_SIZE)}
            onChange={(next) => setSearchParams({ page: String(next) })}
          />
        </>
      )}
    </section>
  )
}
```

- Số trang đọc từ URL (`?page=2`) giống trang danh sách sản phẩm, dùng lại component `Pagination` của Phần 9.
- `order.items` đã có trong mỗi đơn (`findMine` lấy kèm `relations: { items: true }`), nên một dòng tóm tắt "iPhone 17 Pro Max × 1, ..." không cần gọi thêm API.

## Bước 4: Trang chi tiết và huỷ đơn

Tạo `web/src/pages/OrderDetailPage.tsx`:

```tsx
import { Link, useParams } from 'react-router'
import ErrorBox from '../components/ErrorBox.tsx'
import OrderStatusBadge from '../components/OrderStatusBadge.tsx'
import { ApiError } from '../lib/api.ts'
import { formatPrice } from '../lib/format.ts'
import { formatDateTime, PAYMENT_LABELS } from '../lib/order-status.ts'
import { useCancelOrder, useMyOrder } from '../lib/orders.ts'
import NotFoundPage from './NotFoundPage.tsx'

// /tai-khoan/don-hang/:code (behind <RequireAuth>)
export default function OrderDetailPage() {
  const { code = '' } = useParams()
  const { data: order, isPending, isError, error, refetch } = useMyOrder(code)
  const cancelOrder = useCancelOrder()

  if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200" aria-busy="true" />
  if (isError) {
    // Unknown code, or someone else's order: the API answers 404 for both
    if (error instanceof ApiError && error.status === 404) return <NotFoundPage />
    return <ErrorBox error={error} onRetry={() => refetch()} />
  }

  function handleCancel() {
    // window.confirm: the browser's built-in OK/Cancel dialog, enough for a learning project
    if (window.confirm(`Huỷ đơn hàng ${code}? Hành động này không hoàn tác được.`)) {
      cancelOrder.mutate(code)
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <Link to="/tai-khoan/don-hang" className="text-sm text-amber-700 hover:underline">
        ‹ Đơn hàng của tôi
      </Link>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">
            Đơn hàng <span className="font-mono">{order.code}</span>
          </h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">Đặt lúc {formatDateTime(order.createdAt)}</p>

        <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[140px_1fr]">
          <dt className="text-slate-500">Người nhận</dt>
          <dd>
            {order.shippingName} - {order.shippingPhone}
          </dd>
          <dt className="text-slate-500">Địa chỉ</dt>
          <dd>{order.shippingAddress}</dd>
          <dt className="text-slate-500">Thanh toán</dt>
          <dd>{PAYMENT_LABELS[order.paymentMethod]}</dd>
          {order.note && (
            <>
              <dt className="text-slate-500">Ghi chú</dt>
              <dd>{order.note}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <ul className="divide-y divide-slate-100 text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 py-2">
              <span>
                {item.productName}
                <span className="block text-slate-500">
                  {item.variantName} · {formatPrice(item.unitPrice)} × {item.quantity}
                </span>
              </span>
              <span className="whitespace-nowrap">{formatPrice(item.unitPrice * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
          <div className="flex justify-between">
            <dt>Tạm tính</dt>
            <dd>{formatPrice(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Phí giao hàng</dt>
            <dd>{order.shippingFee === 0 ? 'Miễn phí' : formatPrice(order.shippingFee)}</dd>
          </div>
          <div className="flex justify-between text-base font-bold">
            <dt>Tổng cộng</dt>
            <dd className="text-red-600">{formatPrice(order.total)}</dd>
          </div>
        </dl>
      </div>

      {cancelOrder.isError && <ErrorBox error={cancelOrder.error} />}
      {order.status === 'pending' && (
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelOrder.isPending}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {cancelOrder.isPending ? 'Đang huỷ...' : 'Huỷ đơn hàng'}
        </button>
      )}
    </section>
  )
}
```

- Mã đơn của người khác cũng nhận **404** như mã không tồn tại (server cố ý làm vậy để không lộ mã đơn của ai), nên trang hiện `NotFoundPage`.
- `window.confirm(...)` mở hộp thoại OK/Huỷ có sẵn của trình duyệt và **chờ** người dùng chọn; trả `true` khi bấm OK.
- Nút "Huỷ đơn hàng" chỉ hiện khi `status === 'pending'`. Server vẫn kiểm tra lại: nếu cửa hàng vừa xác nhận đơn trong lúc khách đang xem trang, API trả **409** "Chỉ huỷ được đơn hàng đang chờ xác nhận" và `ErrorBox` hiện câu đó.
- `cancelOrder.mutate(code)`: không cần `await`, trạng thái đọc qua `cancelOrder.isPending`, `cancelOrder.isError`.

## Bước 5: Nối vào app

Thay toàn bộ `web/src/App.tsx` (thêm 2 route, cần đăng nhập):

```tsx
import { Route, Routes } from 'react-router'
import RequireAuth from './auth/RequireAuth.tsx'
import Layout from './components/Layout.tsx'
import AccountPage from './pages/AccountPage.tsx'
import CartPage from './pages/CartPage.tsx'
import CheckoutPage from './pages/CheckoutPage.tsx'
import HomePage from './pages/HomePage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'
import OrderDetailPage from './pages/OrderDetailPage.tsx'
import OrderHistoryPage from './pages/OrderHistoryPage.tsx'
import OrderSuccessPage from './pages/OrderSuccessPage.tsx'
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
        <Route
          path="tai-khoan/don-hang"
          element={
            <RequireAuth>
              <OrderHistoryPage />
            </RequireAuth>
          }
        />
        <Route
          path="tai-khoan/don-hang/:code"
          element={
            <RequireAuth>
              <OrderDetailPage />
            </RequireAuth>
          }
        />
        <Route path="gio-hang" element={<CartPage />} />
        <Route
          path="thanh-toan"
          element={
            <RequireAuth>
              <CheckoutPage />
            </RequireAuth>
          }
        />
        <Route
          path="dat-hang-thanh-cong/:code"
          element={
            <RequireAuth>
              <OrderSuccessPage />
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

Thay toàn bộ `web/src/pages/AccountPage.tsx` (thêm nút "Đơn hàng của tôi"):

```tsx
import { Link } from 'react-router'
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
      <Link
        to="/tai-khoan/don-hang"
        className="mt-6 block rounded-lg bg-amber-400 px-4 py-2 text-center font-medium hover:bg-amber-500"
      >
        Đơn hàng của tôi
      </Link>
      <button type="button" onClick={logout} className="mt-6 text-sm text-red-600 underline">
        Đăng xuất
      </button>
    </section>
  )
}
```

Thay toàn bộ `web/src/pages/OrderSuccessPage.tsx` (thêm link "Xem đơn hàng"):

```tsx
import { Link, useParams } from 'react-router'
import ErrorBox from '../components/ErrorBox.tsx'
import { formatPrice } from '../lib/format.ts'
import { useMyOrder } from '../lib/orders.ts'

// /dat-hang-thanh-cong/:code. Reads the order from the API (or the cache filled by
// useCreateOrder), so a reload still works.
export default function OrderSuccessPage() {
  const { code = '' } = useParams()
  const { data: order, isPending, isError, error, refetch } = useMyOrder(code)

  if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200" aria-busy="true" />
  if (isError) return <ErrorBox error={error} onRetry={() => refetch()} />

  return (
    <section className="mx-auto max-w-lg rounded-2xl bg-white p-8 text-center shadow-sm">
      <p className="text-5xl">✓</p>
      <h1 className="mt-2 text-2xl font-bold text-emerald-700">Đặt hàng thành công</h1>
      <p className="mt-2 text-slate-600">
        Mã đơn hàng: <strong className="font-mono text-slate-900">{order.code}</strong>
      </p>
      <p className="mt-1 text-slate-600">
        Tổng thanh toán: <strong className="text-red-600">{formatPrice(order.total)}</strong>
      </p>

      {order.paymentMethod === 'bank_transfer' ? (
        <div className="mt-6 rounded-lg bg-amber-50 p-4 text-left text-sm">
          <p className="font-semibold">Chuyển khoản tới:</p>
          {/* Sample account for the learning project */}
          <p>Ngân hàng TechBank - STK 0123 456 789 - CTY TECHSTORE</p>
          <p>
            Nội dung chuyển khoản: <strong className="font-mono">{order.code}</strong>
          </p>
        </div>
      ) : (
        <p className="mt-6 text-sm text-slate-500">Bạn sẽ thanh toán khi nhận hàng. Chúng tôi sẽ gọi xác nhận sớm.</p>
      )}

      <div className="mt-6 flex justify-center gap-4 text-sm">
        <Link to={`/tai-khoan/don-hang/${order.code}`} className="rounded-lg border border-slate-300 px-4 py-2">
          Xem đơn hàng
        </Link>
        <Link to="/san-pham" className="rounded-lg bg-amber-400 px-4 py-2 font-medium">
          Tiếp tục mua sắm
        </Link>
      </div>
    </section>
  )
}
```

## Bước 6: Xoá dữ liệu cá nhân khỏi cache khi đăng xuất

Cache của TanStack Query nằm trong bộ nhớ trình duyệt. Nếu chỉ xoá token, người dùng B đăng nhập ngay sau người dùng A trên cùng máy có thể thấy lịch sử đơn của A (lấy từ cache) trong tích tắc trước khi API trả về.

Thay toàn bộ `web/src/auth/AuthProvider.tsx`:

```tsx
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler, TOKEN_KEY } from '../lib/api.ts'
import type { AuthResponse, User } from '../lib/types.ts'
import { AuthContext, type AuthState, type RegisterInput } from './auth-context.ts'

// First part of the queryKey of every cached query that holds personal data
const PRIVATE_QUERY_KEYS = ['me', 'orders', 'order']

// Forget everything that belongs to the logged-in user, so the next person
// on this browser never sees the previous user's orders from the cache
function forgetUserData(queryClient: QueryClient) {
  for (const key of PRIVATE_QUERY_KEYS) queryClient.removeQueries({ queryKey: [key] })
}

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
    forgetUserData(queryClient)
  }

  // lib/api.ts calls this when the API answers 401 to a request that carried our token
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null)
      forgetUserData(queryClient)
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

`removeQueries({ queryKey: ['orders'] })` xoá **mọi** query có khoá bắt đầu bằng `'orders'` (`['orders', 1]`, `['orders', 2]`...). Khi có thêm dữ liệu riêng tư (Phần 12 có các query `admin`), thêm khoá vào `PRIVATE_QUERY_KEYS`.

## Bước 7: Chạy thử

1. Đăng nhập, đặt vài đơn (hoặc tạo nhanh bằng Swagger `POST /orders` với token của bạn) cho tới hơn 10 đơn.
2. `/tai-khoan` → "Đơn hàng của tôi": 10 đơn mới nhất trước, nhãn "Chờ xác nhận"; trang 2 có phần còn lại.
3. Bấm một đơn đang chờ: đủ thông tin, giá từng dòng là giá lúc mua.
4. Bấm "Huỷ đơn hàng", chọn **Huỷ** ở hộp thoại: không có gì xảy ra. Bấm lại, chọn **OK**: nhãn "Đã huỷ", nút biến mất. Quay về danh sách: đơn đó cũng "Đã huỷ". Database: tồn kho của phiên bản đó tăng lại.
5. Thử 409: mở trang chi tiết một đơn đang chờ, rồi dùng tài khoản admin trên Swagger gọi `PATCH /admin/orders/<mã>/status` với `{ "status": "confirmed" }`. Quay lại trang (chưa F5), bấm Huỷ → OK: "Chỉ huỷ được đơn hàng đang chờ xác nhận".
6. Mở `/tai-khoan/don-hang/<mã đơn của khachmau@techstore.vn>` (lấy trong bảng `Orders` nếu đã chạy `db:seed-orders`): trang 404.
7. Đăng xuất, đăng nhập tài khoản khác chưa có đơn, mở "Đơn hàng của tôi": "Bạn chưa có đơn hàng nào.", không thấy đơn của người trước.

## Kiểm tra

- [ ] `npm run lint` và `npm run build` trong `web/` đều qua
- [ ] Danh sách phân trang đúng, mới nhất trước; chi tiết hiện đúng giá lúc mua
- [ ] Huỷ được đơn đang chờ (có hỏi lại), tồn kho được trả; 409 hiện đúng thông báo
- [ ] Đơn của người khác → 404; đăng xuất xong người sau không thấy đơn của người trước
- [ ] Giải thích được: vì sao server trả 404 (không phải 403) cho đơn của người khác; vì sao nút ẩn rồi mà server vẫn phải kiểm tra trạng thái
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Thêm link "Đơn hàng" vào header (cạnh "Chào, ...") khi đã đăng nhập.
2. Thay `window.confirm` bằng hộp thoại tự làm: một `<dialog>` HTML với hai nút, mở bằng `dialogRef.current?.showModal()` (`useRef`).
