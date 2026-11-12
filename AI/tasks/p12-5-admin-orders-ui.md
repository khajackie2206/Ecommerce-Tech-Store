## Mục tiêu

Phần đơn hàng của khu quản trị, dùng các API admin đơn hàng của Phần 12:

| URL | Trang |
|---|---|
| `/admin/don-hang?status=pending&q=0901&page=2` | Mọi đơn, mới nhất trước, 20 đơn/trang. Các tab lọc trạng thái (Tất cả, Chờ xác nhận, Đã xác nhận, Đang giao, Hoàn thành, Đã huỷ), ô tìm theo **mã đơn, số điện thoại hoặc tên người nhận** |
| `/admin/don-hang/TS...` | Chi tiết: khách đặt (tên, email), giao hàng, thanh toán, ghi chú, từng dòng sản phẩm, tạm tính, phí giao, tổng. Các nút **chỉ cho những bước được phép** từ trạng thái hiện tại |

Vòng đời đơn hàng (giống `NEXT_STATUSES` bên server):

```
pending ──Xác nhận đơn──> confirmed ──Bắt đầu giao hàng──> shipping ──Đã giao xong──> completed
   │                          │
   └──────Huỷ đơn─────────────┴──> cancelled   (huỷ: trả lại tồn kho)
```

Nếu trạng thái đã bị đổi ở nơi khác (khách vừa huỷ, admin khác vừa xác nhận), API trả **409** `Không thể chuyển đơn từ "cancelled" sang "confirmed"`. Trang hiện câu đó và tự tải lại đơn để thấy trạng thái thật.

**Làm sau:** task "API admin: quản lý đơn hàng" (server), task "Giao diện admin: quản lý sản phẩm" (dùng `AdminLayout`, `RequireAdmin`, `ADMIN_INPUT`) và task "Trang lịch sử đơn hàng" (dùng `OrderStatusBadge`, `lib/order-status.ts`). Song song được với task "Dashboard admin".

**Đọc trước:** nhắc lại `OrdersService.findAllForAdmin` và `changeStatus` (server).

## Bước 1: Các bước chuyển trạng thái

Trong `web/src/lib/order-status.ts`, thêm `NEXT_STATUSES` và `ACTION_LABELS` (trước `PAYMENT_LABELS`). File hoàn chỉnh:

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

// Copy of NEXT_STATUSES in server/src/orders/orders.service.ts: which status may follow which.
// The server checks it again (409); here it only decides which buttons to show.
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipping', 'cancelled'],
  shipping: ['completed'],
  completed: [],
  cancelled: [],
}

// Text of the admin button that moves an order TO this status
export const ACTION_LABELS: Record<OrderStatus, string> = {
  pending: '',
  confirmed: 'Xác nhận đơn',
  shipping: 'Bắt đầu giao hàng',
  completed: 'Đã giao xong',
  cancelled: 'Huỷ đơn',
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

`NEXT_STATUSES` chép nguyên từ `orders.service.ts`. Ở web nó chỉ quyết định **hiện nút nào**; server vẫn kiểm tra lại (Phần 12), vì hai người có thể bấm cùng lúc.

## Bước 2: Hook đơn hàng admin

Tạo `web/src/admin/admin-orders.ts`:

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api.ts'
import type { Order, OrderStatus, Paginated, User } from '../lib/types.ts'

// The admin also sees who placed the order (relations: { user: true } on the server)
export type AdminOrder = Order & { user: User }

export const ADMIN_ORDERS_PAGE_SIZE = 20

export type AdminOrderFilters = { status?: OrderStatus; q?: string; page: number }

export function useAdminOrders(filters: AdminOrderFilters) {
  return useQuery({
    queryKey: ['admin', 'orders', filters],
    queryFn: () =>
      api<Paginated<AdminOrder>>('/admin/orders', { params: { ...filters, limit: ADMIN_ORDERS_PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  })
}

export function useAdminOrder(code: string) {
  return useQuery({
    queryKey: ['admin', 'order', code],
    queryFn: () => api<AdminOrder>(`/admin/orders/${code}`),
  })
}

export function useChangeOrderStatus(code: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (status: OrderStatus) =>
      api<Order>(`/admin/orders/${code}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'order', code] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
      // The dashboard (reports) counts orders by status
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] })
      // Cancelling gives stock back to the shop
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['product'] })
    },
    // 409: someone changed the order meanwhile (the customer cancelled it...).
    // Read it again so the page shows the real status and the right buttons.
    onError: () => queryClient.invalidateQueries({ queryKey: ['admin', 'order', code] }),
  })
}
```

- `AdminOrder = Order & { user: User }`: API admin trả thêm người đặt (`relations: { user: true }`); `passwordHash` đã bị `@Exclude()` (Phần 7) nên không có trong JSON.
- Đổi trạng thái thành công: làm cũ đơn này, danh sách đơn, **báo cáo** (dashboard đếm đơn theo trạng thái) và sản phẩm (huỷ đơn thì tồn kho tăng).
- `onError`: lỗi 409 nghĩa là dữ liệu trên trang đã cũ. Làm cũ query của đơn để trang tải lại, hiện trạng thái thật và đúng các nút.

## Bước 3: Danh sách đơn

Tạo `web/src/admin/AdminOrderListPage.tsx`:

```tsx
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import ErrorBox from '../components/ErrorBox.tsx'
import OrderStatusBadge from '../components/OrderStatusBadge.tsx'
import Pagination from '../components/Pagination.tsx'
import { formatPrice } from '../lib/format.ts'
import { formatDateTime, STATUS_LABELS } from '../lib/order-status.ts'
import type { OrderStatus } from '../lib/types.ts'
import { ADMIN_ORDERS_PAGE_SIZE, useAdminOrders } from './admin-orders.ts'
import { ADMIN_INPUT } from './product-form.ts'

const STATUSES = Object.keys(STATUS_LABELS) as OrderStatus[]

// /admin/don-hang?status=pending&q=0901&page=2
export default function AdminOrderListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status')
  const status = STATUSES.find((s) => s === statusParam)
  const q = searchParams.get('q') ?? ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useAdminOrders({
    status,
    q: q || undefined,
    page,
  })

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setSearchParams(next)
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    update({ q: String(new FormData(event.currentTarget).get('q') ?? '').trim() })
  }

  const tab = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm ${active ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-200'}`

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold">Đơn hàng {data && <span className="text-slate-400">({data.total})</span>}</h1>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lọc theo trạng thái">
        <button
          type="button"
          role="tab"
          aria-selected={!status}
          className={tab(!status)}
          onClick={() => update({ status: '' })}
        >
          Tất cả
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            className={tab(status === s)}
            onClick={() => update({ status: s })}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <form key={q} onSubmit={handleSearch}>
        <input name="q" defaultValue={q} placeholder="Mã đơn, số điện thoại hoặc tên người nhận..." className={ADMIN_INPUT} />
      </form>

      {isError && <ErrorBox error={error} onRetry={() => refetch()} />}
      {isPending && <div className="h-64 animate-pulse rounded-xl bg-slate-200" />}

      {data && (
        <div className={`overflow-x-auto rounded-xl bg-white shadow-sm ${isPlaceholderData ? 'opacity-50' : ''}`}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-3">Mã đơn</th>
                <th className="p-3">Ngày đặt</th>
                <th className="p-3">Người nhận</th>
                <th className="p-3 text-right">Tổng tiền</th>
                <th className="p-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((order) => (
                <tr key={order.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <Link to={`/admin/don-hang/${order.code}`} className="font-mono font-medium text-amber-700 hover:underline">
                      {order.code}
                    </Link>
                  </td>
                  <td className="p-3 whitespace-nowrap">{formatDateTime(order.createdAt)}</td>
                  <td className="p-3">
                    {order.shippingName}
                    <span className="block text-xs text-slate-500">{order.shippingPhone}</span>
                  </td>
                  <td className="p-3 text-right">{formatPrice(order.total)}</td>
                  <td className="p-3">
                    <OrderStatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500">
                    Không có đơn hàng phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <Pagination
          page={page}
          totalPages={Math.ceil(data.total / ADMIN_ORDERS_PAGE_SIZE)}
          onChange={(next) => update({ page: String(next) })}
        />
      )}
    </section>
  )
}
```

- `Object.keys(STATUS_LABELS) as OrderStatus[]`: danh sách 5 trạng thái lấy từ chính object nhãn, không phải gõ lại lần nữa.
- `status` trên URL được kiểm tra bằng `STATUSES.find(...)`: `?status=hack` bị bỏ qua thay vì gửi lên để nhận 400.
- Các tab là nút có `role="tab"` và `aria-selected`: trình đọc màn hình biết đây là một nhóm tab và tab nào đang chọn.
- Tìm theo số điện thoại vẫn giữ tab đang chọn: "đơn **chờ xác nhận** của số 0911222333".

## Bước 4: Chi tiết và đổi trạng thái

Tạo `web/src/admin/AdminOrderDetailPage.tsx`:

```tsx
import { Link, useParams } from 'react-router'
import ErrorBox from '../components/ErrorBox.tsx'
import OrderStatusBadge from '../components/OrderStatusBadge.tsx'
import { ApiError } from '../lib/api.ts'
import { formatPrice } from '../lib/format.ts'
import { ACTION_LABELS, formatDateTime, NEXT_STATUSES, PAYMENT_LABELS } from '../lib/order-status.ts'
import type { OrderStatus } from '../lib/types.ts'
import NotFoundPage from '../pages/NotFoundPage.tsx'
import { useAdminOrder, useChangeOrderStatus } from './admin-orders.ts'

// /admin/don-hang/:code
export default function AdminOrderDetailPage() {
  const { code = '' } = useParams()
  const { data: order, isPending, isError, error, refetch } = useAdminOrder(code)
  const changeStatus = useChangeOrderStatus(code)

  if (isPending) return <div className="h-96 animate-pulse rounded-xl bg-slate-200" />
  if (isError) {
    if (error instanceof ApiError && error.status === 404) return <NotFoundPage />
    return <ErrorBox error={error} onRetry={() => refetch()} />
  }

  function moveTo(next: OrderStatus) {
    if (next === 'cancelled' && !window.confirm(`Huỷ đơn ${code}? Tồn kho sẽ được trả lại.`)) return
    changeStatus.mutate(next)
  }

  const nextStatuses = NEXT_STATUSES[order.status]

  return (
    <section className="space-y-4">
      <Link to="/admin/don-hang" className="text-sm text-amber-700 hover:underline">
        ‹ Danh sách đơn hàng
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div>
          <h1 className="text-xl font-bold">
            Đơn <span className="font-mono">{order.code}</span>
          </h1>
          <p className="text-sm text-slate-500">
            Đặt lúc {formatDateTime(order.createdAt)} · cập nhật {formatDateTime(order.updatedAt)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {/* Only the moves the server allows from the current status */}
      <div className="flex flex-wrap items-center gap-2">
        {nextStatuses.map((next) => (
          <button
            key={next}
            type="button"
            onClick={() => moveTo(next)}
            disabled={changeStatus.isPending}
            className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              next === 'cancelled'
                ? 'border border-red-300 text-red-600 hover:bg-red-50'
                : 'bg-amber-400 hover:bg-amber-500'
            }`}
          >
            {ACTION_LABELS[next]}
          </button>
        ))}
        {nextStatuses.length === 0 && <p className="text-sm text-slate-500">Đơn đã kết thúc, không đổi trạng thái được nữa.</p>}
      </div>
      {changeStatus.isError && <ErrorBox error={changeStatus.error} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-4 text-sm shadow-sm">
          <h2 className="mb-2 font-semibold">Khách đặt</h2>
          <p>{order.user.fullName}</p>
          <p className="text-slate-500">{order.user.email}</p>
          {order.user.phone && <p className="text-slate-500">{order.user.phone}</p>}
        </div>
        <div className="rounded-xl bg-white p-4 text-sm shadow-sm">
          <h2 className="mb-2 font-semibold">Giao hàng</h2>
          <p>
            {order.shippingName} - {order.shippingPhone}
          </p>
          <p className="text-slate-500">{order.shippingAddress}</p>
          <p className="mt-2">{PAYMENT_LABELS[order.paymentMethod]}</p>
          {order.note && <p className="mt-1 italic text-slate-500">Ghi chú: {order.note}</p>}
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2">Sản phẩm</th>
              <th className="py-2 text-right">Đơn giá</th>
              <th className="py-2 text-right">SL</th>
              <th className="py-2 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="py-2">
                  {item.productName}
                  <span className="block text-xs text-slate-500">{item.variantName}</span>
                </td>
                <td className="py-2 text-right">{formatPrice(item.unitPrice)}</td>
                <td className="py-2 text-right">{item.quantity}</td>
                <td className="py-2 text-right">{formatPrice(item.unitPrice * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-right">
            <tr className="border-t border-slate-200">
              <td colSpan={3} className="pt-2">
                Tạm tính
              </td>
              <td className="pt-2">{formatPrice(order.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={3}>Phí giao hàng</td>
              <td>{formatPrice(order.shippingFee)}</td>
            </tr>
            <tr className="font-bold">
              <td colSpan={3}>Tổng cộng</td>
              <td className="text-red-600">{formatPrice(order.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
```

- `NEXT_STATUSES[order.status].map(...)`: mỗi bước được phép là một nút. Đơn `completed` hoặc `cancelled` không còn nút nào, trang ghi "Đơn đã kết thúc".
- Huỷ đơn hỏi lại bằng `window.confirm` vì không quay lại được (đơn huỷ là trạng thái cuối). Các bước khác bấm là chạy.
- `<tfoot>` cho các dòng tổng: phần chân của bảng, đúng ý nghĩa HTML.

## Bước 5: Nối vào app

Thay toàn bộ `web/src/admin/AdminLayout.tsx` (thêm "Đơn hàng" vào `NAV`):

```tsx
import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/auth-context.ts'

// Side menu of the admin area. NavLink adds the "active" style to the current page.
const NAV = [
  { to: '/admin/san-pham', label: 'Sản phẩm' },
  { to: '/admin/don-hang', label: 'Đơn hàng' },
]

export default function AdminLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-800">
      <header className="bg-slate-900 text-white">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <Link to="/admin" className="text-lg font-bold">
            TechStore <span className="text-amber-400">Admin</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/" className="hover:underline">
              Về cửa hàng
            </Link>
            <span className="text-slate-400">{user?.fullName}</span>
            <button type="button" onClick={logout} className="hover:underline">
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <nav className="flex gap-1 bg-white p-2 md:w-52 md:flex-col md:p-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin'}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-amber-100 font-semibold text-amber-900' : 'hover:bg-slate-100'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

Thay toàn bộ `web/src/App.tsx` (thêm 2 route trong khu `/admin`):

```tsx
import { Navigate, Route, Routes } from 'react-router'
import AdminLayout from './admin/AdminLayout.tsx'
import AdminOrderDetailPage from './admin/AdminOrderDetailPage.tsx'
import AdminOrderListPage from './admin/AdminOrderListPage.tsx'
import AdminProductCreatePage from './admin/AdminProductCreatePage.tsx'
import AdminProductEditPage from './admin/AdminProductEditPage.tsx'
import AdminProductListPage from './admin/AdminProductListPage.tsx'
import RequireAdmin from './auth/RequireAdmin.tsx'
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

      {/* Admin area: its own layout (no shop header), admins only */}
      <Route
        path="admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<Navigate to="san-pham" replace />} />
        <Route path="san-pham" element={<AdminProductListPage />} />
        <Route path="san-pham/moi" element={<AdminProductCreatePage />} />
        <Route path="san-pham/:id" element={<AdminProductEditPage />} />
        <Route path="don-hang" element={<AdminOrderListPage />} />
        <Route path="don-hang/:code" element={<AdminOrderDetailPage />} />
      </Route>
    </Routes>
  )
}
```

## Bước 6: Chạy thử

Đăng nhập admin. Dùng một tài khoản khách đặt vài đơn (trang thanh toán Phần 11, hoặc Swagger `POST /orders`), một đơn ghi số điện thoại 0911222333.

1. "Đơn hàng" ở menu trái: số đơn bằng `SELECT COUNT(*) FROM Orders`. Tab "Chờ xác nhận": URL có `status=pending`, số đơn bằng `SELECT COUNT(*) FROM Orders WHERE status = 'pending'`.
2. Gõ `0911222333`: chỉ còn đơn chờ xác nhận của số đó. Bấm "Tất cả", tìm theo mã đơn: 1 đơn.
3. Mở một đơn chờ xác nhận: thấy email người đặt; nút "Xác nhận đơn" và "Huỷ đơn". Bấm lần lượt "Xác nhận đơn" → "Bắt đầu giao hàng" → "Đã giao xong": nhãn đổi theo, cuối cùng "Đơn đã kết thúc...". Database: `status = 'completed'`.
4. Đơn khác, bấm "Huỷ đơn" → OK: "Đã huỷ", tồn kho của phiên bản trong đơn tăng lại.
5. Thử 409: mở một đơn đang chờ ở trang admin; bằng tài khoản khách (tab khác) huỷ đơn đó ở "Đơn hàng của tôi". Quay lại trang admin (chưa F5), bấm "Xác nhận đơn": `Không thể chuyển đơn từ "cancelled" sang "confirmed"`, trang tự cập nhật thành "Đã huỷ", không còn nút.
6. Ở tab của khách, F5 trang "Đơn hàng của tôi": thấy đúng trạng thái admin vừa đổi. (Không F5 thì có thể còn thấy trạng thái cũ tới 30 giây: `staleTime` của Phần 9. Hai trình duyệt không chia sẻ cache với nhau.)
7. Mở `/admin/don-hang/KHONGCO`: trang 404.

## Kiểm tra

- [ ] `npm run lint` và `npm run build` trong `web/` đều qua
- [ ] Lọc theo trạng thái, tìm theo mã/SĐT/tên, phân trang đều nằm trên URL
- [ ] Chỉ hiện nút của bước được phép; đi hết vòng đời tới "Hoàn thành"; huỷ trả lại tồn kho
- [ ] 409 hiện đúng câu và trang tự cập nhật trạng thái thật
- [ ] Giải thích được: vì sao đã ẩn nút mà server vẫn phải kiểm tra bước chuyển; `onError` làm cũ query để làm gì
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Thêm cột "Số SP" (tổng `quantity` của các dòng) vào bảng danh sách: `order.items` đã có sẵn trong mỗi đơn.
2. Thêm nút "In đơn" ở trang chi tiết gọi `window.print()`, và dùng class `print:hidden` của Tailwind để ẩn menu, các nút khi in.
