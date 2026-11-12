## Mục tiêu

Trang `/admin` (trang đầu tiên admin thấy) thành **bảng tổng quan**, dùng 3 API báo cáo của Phần 13:

- Chọn khoảng ngày: mặc định **30 ngày gần nhất**, nút nhanh 7 / 30 / 90 ngày, hai ô "Từ ngày", "Đến ngày".
- 4 thẻ số liệu: doanh thu, số đơn hoàn thành, giá trị trung bình mỗi đơn, số sản phẩm đã bán (`GET /admin/reports/summary`).
- Số đơn theo từng trạng thái, bấm vào thì sang danh sách đơn đã lọc.
- **Biểu đồ cột doanh thu theo ngày** (`GET /admin/reports/revenue-by-day`), rê chuột vào cột thấy ngày và số tiền.
- Bảng 5 sản phẩm bán chạy (`GET /admin/reports/top-products`).
- Khoảng ngày không có đơn hoàn thành: báo "Chưa có đơn hoàn thành trong khoảng thời gian này."; khoảng quá 1 năm: hiện lỗi 400 của API.

**Làm sau:** task "API báo cáo doanh thu và sản phẩm bán chạy" (server) và task "Giao diện admin: quản lý sản phẩm" (`AdminLayout`). Song song được với task "Giao diện admin: quản lý đơn hàng" (hai task cùng sửa `App.tsx` và `AdminLayout.tsx`, ai merge sau thì gộp tay hai dòng).

**Đọc trước:** https://recharts.github.io/en-US/guide/getting-started; https://react.dev/reference/react/lazy.

## Dữ liệu mẫu

Dashboard cần nhiều đơn **hoàn thành** rải rác trong nhiều ngày. Nếu chưa có, chạy script mẫu của task API báo cáo:

```powershell
npm run db:seed-orders   # ~150 đơn trong 60 ngày gần nhất, của tài khoản khachmau@techstore.vn
```

## Chọn thư viện biểu đồ

| Thư viện | Cách dùng | Nhận xét |
|---|---|---|
| **Recharts** (chọn) | Component React: `<BarChart data={...}><Bar dataKey="revenue" /></BarChart>` | Viết như JSX bình thường, dữ liệu là mảng object; vẽ bằng SVG nên chữ sắc nét, tự co theo khung. Đủ cho dashboard |
| Chart.js (+ `react-chartjs-2`) | Một object cấu hình lớn | Rất phổ biến, vẽ bằng canvas (nhanh với hàng chục nghìn điểm), nhưng cấu hình dạng object, ít "React" hơn |
| D3 | Tự vẽ từng phần | Linh hoạt nhất, nhưng phải tự làm trục, chú thích, tooltip... Quá sức cho nhu cầu này |

API trả sẵn đúng hình dạng Recharts cần: `[{ date: "2026-11-05", orders: 2, revenue: 104960000 }, ...]`, **đủ mọi ngày** (ngày không có đơn là `0`, server đã điền), nên không phải xử lý gì thêm.

## Bước 1: Cài Recharts

```powershell
cd web
npm install recharts
```

Bản cài được là `recharts` 3.x (hỗ trợ React 19). Teammate pull về chạy `npm run setup`.

## Bước 2: Hook báo cáo và ngày theo giờ Việt Nam

Tạo `web/src/admin/admin-reports.ts`:

```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api.ts'
import type { OrderStatus } from '../lib/types.ts'

// Shapes returned by server/src/reports/reports.service.ts
export type ReportSummary = {
  from: string
  to: string
  revenue: number // completed orders only
  completedOrders: number
  averageOrderValue: number
  itemsSold: number
  ordersByStatus: Partial<Record<OrderStatus, number>>
}

export type DailyRevenue = { date: string; orders: number; revenue: number }

export type TopProduct = {
  productId: number
  name: string
  slug: string
  thumbnailUrl: string | null
  quantity: number
  revenue: number
}

// Days are "YYYY-MM-DD" in Vietnam time, both included (same rule as the API)
export type DayRange = { from: string; to: string }

const DAY_MS = 24 * 60 * 60 * 1000
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000

// Today in Vietnam, whatever the time zone of this computer
export function vietnamToday(): string {
  return new Date(Date.now() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10)
}

// "2026-11-12" minus 29 days -> "2026-10-14" (a 30-day range, today included)
export function lastDays(days: number): DayRange {
  const to = vietnamToday()
  const from = new Date(Date.parse(to) - (days - 1) * DAY_MS).toISOString().slice(0, 10)
  return { from, to }
}

export function useReportSummary(range: DayRange) {
  return useQuery({
    queryKey: ['admin', 'reports', 'summary', range],
    queryFn: () => api<ReportSummary>('/admin/reports/summary', { params: range }),
    placeholderData: keepPreviousData,
  })
}

export function useRevenueByDay(range: DayRange) {
  return useQuery({
    queryKey: ['admin', 'reports', 'revenue-by-day', range],
    queryFn: () => api<DailyRevenue[]>('/admin/reports/revenue-by-day', { params: range }),
    placeholderData: keepPreviousData,
  })
}

export function useTopProducts(range: DayRange, limit = 5) {
  return useQuery({
    queryKey: ['admin', 'reports', 'top-products', range, limit],
    queryFn: () => api<TopProduct[]>('/admin/reports/top-products', { params: { ...range, limit } }),
    placeholderData: keepPreviousData,
  })
}
```

- Các kiểu `ReportSummary`, `DailyRevenue`, `TopProduct` chép từ `reports.service.ts`.
- `vietnamToday()`: ngày hôm nay **ở Việt Nam** (UTC+7), dù máy đang đặt múi giờ nào; cùng cách tính với `toRange()` của server. 7 giờ sáng ở Việt Nam vẫn là 0 giờ UTC "hôm qua": tính sai là lệch một ngày.
- `lastDays(30)`: từ hôm nay lùi 29 ngày = 30 ngày tính cả hôm nay.
- `queryKey` có cả `range`: đổi khoảng ngày là một mục cache mới; quay lại khoảng cũ thì hiện ngay từ cache.

## Bước 3: Biểu đồ

Tạo `web/src/admin/RevenueChart.tsx`:

```tsx
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatPrice } from '../lib/format.ts'
import type { DailyRevenue } from './admin-reports.ts'

// "2026-11-05" -> "05/11"
const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`

// 125000000 -> "125tr", 1500000000 -> "1,5 tỷ": short labels for the Y axis
function compactVnd(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}tr`
  return String(value)
}

// One bar per day. recharts draws SVG from plain data: [{ date, revenue, orders }, ...]
export default function RevenueChart({ data }: { data: DailyRevenue[] }) {
  return (
    // ResponsiveContainer: the chart takes the width of its parent (phone or desktop)
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12 }} minTickGap={16} />
        <YAxis tickFormatter={compactVnd} tick={{ fontSize: 12 }} width={56} />
        <Tooltip
          labelFormatter={(label) => `Ngày ${shortDate(String(label))}`}
          formatter={(value) => [formatPrice(Number(value)), 'Doanh thu']}
        />
        <Bar dataKey="revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- `<ResponsiveContainer width="100%" height={300}>`: biểu đồ rộng bằng khung chứa nó, co lại trên điện thoại.
- `dataKey="date"` / `dataKey="revenue"`: tên field trong mỗi object dữ liệu.
- `tickFormatter`: chữ trên trục. Trục ngang `05/11` thay cho `2026-11-05`; trục dọc `125tr`, `1,5 tỷ` thay cho số 9 chữ số.
- `<Tooltip formatter>`: rê chuột vào cột hiện `Doanh thu : 222.920.000 ₫` (`formatPrice` của Phần 9).
- `minTickGap={16}`: 90 ngày thì 90 nhãn sẽ chồng lên nhau; Recharts tự bỏ bớt nhãn cho thoáng.

## Bước 4: Trang tổng quan

Tạo `web/src/admin/AdminDashboardPage.tsx`:

```tsx
import { useState } from 'react'
import { Link } from 'react-router'
import ErrorBox from '../components/ErrorBox.tsx'
import OrderStatusBadge from '../components/OrderStatusBadge.tsx'
import { formatPrice } from '../lib/format.ts'
import { STATUS_LABELS } from '../lib/order-status.ts'
import type { OrderStatus } from '../lib/types.ts'
import { lastDays, useReportSummary, useRevenueByDay, useTopProducts, type DayRange } from './admin-reports.ts'
import { ADMIN_INPUT } from './product-form.ts'
import RevenueChart from './RevenueChart.tsx'

const PRESETS = [7, 30, 90]
const STATUSES = Object.keys(STATUS_LABELS) as OrderStatus[]

// /admin: key figures, revenue per day, best sellers for a range of days
export default function AdminDashboardPage() {
  const [range, setRange] = useState<DayRange>(() => lastDays(30))
  const summary = useReportSummary(range)
  const revenue = useRevenueByDay(range)
  const top = useTopProducts(range)

  // Any failed report (e.g. 400 "Khoảng thời gian tối đa 1 năm") is shown once, on top
  const error = summary.error ?? revenue.error ?? top.error
  const hasRevenue = (summary.data?.revenue ?? 0) > 0

  const cards = summary.data
    ? [
        { label: 'Doanh thu', value: formatPrice(summary.data.revenue) },
        { label: 'Đơn hoàn thành', value: summary.data.completedOrders.toLocaleString('vi-VN') },
        { label: 'Giá trị trung bình / đơn', value: formatPrice(summary.data.averageOrderValue) },
        { label: 'Sản phẩm đã bán', value: summary.data.itemsSold.toLocaleString('vi-VN') },
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-xl font-bold">Tổng quan</h1>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          {PRESETS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setRange(lastDays(days))}
              className="rounded-lg bg-white px-3 py-2 hover:bg-slate-200"
            >
              {days} ngày
            </button>
          ))}
          <label>
            Từ ngày
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })}
              className={ADMIN_INPUT}
            />
          </label>
          <label>
            Đến ngày
            <input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })}
              className={ADMIN_INPUT}
            />
          </label>
        </div>
      </div>

      {error && <ErrorBox error={error} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summary.isPending
          ? Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200" />)
          : cards.map((card) => (
              <div key={card.label} className="rounded-xl bg-white p-4 shadow-sm">
                <p className="text-sm text-slate-500">{card.label}</p>
                <p className="mt-1 text-xl font-bold">{card.value}</p>
              </div>
            ))}
      </div>

      {summary.data && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 text-sm shadow-sm">
          <span className="text-slate-500">Đơn theo trạng thái:</span>
          {STATUSES.map((status) => (
            <Link key={status} to={`/admin/don-hang?status=${status}`} className="flex items-center gap-1">
              <OrderStatusBadge status={status} />
              <strong>{summary.data.ordersByStatus[status] ?? 0}</strong>
            </Link>
          ))}
        </div>
      )}

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Doanh thu theo ngày (đơn hoàn thành)</h2>
        {revenue.isPending && <div className="h-72 animate-pulse rounded-lg bg-slate-100" />}
        {revenue.data && hasRevenue && <RevenueChart data={revenue.data} />}
        {revenue.data && summary.data && !hasRevenue && (
          <p className="py-16 text-center text-slate-500">Chưa có đơn hoàn thành trong khoảng thời gian này.</p>
        )}
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Sản phẩm bán chạy</h2>
        {top.data && top.data.length === 0 && <p className="py-6 text-center text-slate-500">Chưa có dữ liệu.</p>}
        {top.data && top.data.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">#</th>
                <th className="py-2">Sản phẩm</th>
                <th className="py-2 text-right">Đã bán</th>
                <th className="py-2 text-right">Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {top.data.map((product, index) => (
                <tr key={product.productId} className="border-t border-slate-100">
                  <td className="py-2 text-slate-400">{index + 1}</td>
                  <td className="py-2">
                    <Link to={`/admin/san-pham/${product.productId}`} className="flex items-center gap-3 hover:underline">
                      <img src={product.thumbnailUrl ?? ''} alt="" className="h-10 w-10 rounded bg-slate-100 object-cover" />
                      {product.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right">{product.quantity}</td>
                  <td className="py-2 text-right">{formatPrice(product.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
```

Giải thích:
- `range` nằm trong `useState` (khởi tạo bằng hàm, chỉ tính một lần). Ba hook báo cáo cùng nhận `range`: đổi ngày là cả ba gọi lại **song song**.
- `<input type="date">` cho giá trị dạng `YYYY-MM-DD`, đúng định dạng API cần. `max={range.to}` / `min={range.from}` để không chọn được "từ" sau "đến". Ô bị xoá trắng thì bỏ qua (`e.target.value && ...`).
- `error = summary.error ?? revenue.error ?? top.error`: ba API kiểm tra cùng một khoảng ngày, lỗi (ví dụ quá 1 năm) giống nhau, chỉ hiện một lần.
- Doanh thu bằng 0 thì không vẽ biểu đồ toàn cột rỗng mà hiện câu thông báo.
- Số đơn theo trạng thái là link sang `/admin/don-hang?status=...` (task quản lý đơn hàng).
- `placeholderData: keepPreviousData` (trong hook): đổi khoảng ngày thì số liệu cũ vẫn hiện tới khi số mới về, không nhấp nháy.

## Bước 5: Chỉ tải Recharts khi cần (`lazy`)

Recharts khá nặng. Nếu import bình thường, **mọi khách** vào cửa hàng đều phải tải nó dù không bao giờ mở trang admin. `lazy()` tách trang dashboard (và Recharts) ra một file JavaScript riêng, chỉ tải khi admin mở `/admin`.

Thay toàn bộ `web/src/App.tsx`:

```tsx
import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
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

// The dashboard pulls in the chart library (recharts, large). lazy(): its code is a separate
// file, downloaded only when an admin opens /admin, never by shoppers.
const AdminDashboardPage = lazy(() => import('./admin/AdminDashboardPage.tsx'))

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
        <Route
          index
          element={
            // Shown while the dashboard file downloads
            <Suspense fallback={<p className="text-slate-500">Đang tải...</p>}>
              <AdminDashboardPage />
            </Suspense>
          }
        />
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

- `lazy(() => import('./admin/AdminDashboardPage.tsx'))`: `import()` có dấu ngoặc là import **lúc chạy**; Vite thấy nó và tách file.
- `<Suspense fallback={...}>`: hiện "Đang tải..." trong lúc tải file đó.
- Route `index` của `/admin` giờ là dashboard (thay cho `<Navigate to="san-pham" />` của task quản lý sản phẩm).

Chạy `npm run build` để thấy kết quả tách file:

```
dist/assets/index-....js               368.61 kB │ gzip: 110.01 kB
dist/assets/AdminDashboardPage-....js  374.21 kB │ gzip: 107.72 kB
```

Không tách thì khách tải một file khoảng 740 kB thay vì 370 kB.

Thay toàn bộ `web/src/admin/AdminLayout.tsx` (thêm "Tổng quan" đầu menu; `end` để mục này chỉ sáng ở đúng `/admin`, không sáng ở mọi trang con):

```tsx
import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/auth-context.ts'

// Side menu of the admin area. NavLink adds the "active" style to the current page.
const NAV = [
  { to: '/admin', label: 'Tổng quan' },
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

## Bước 6: Chạy thử

1. Đăng nhập admin, mở `/admin`: "Từ ngày" là 29 ngày trước, "Đến ngày" là hôm nay (giờ Việt Nam).
2. Đối chiếu thẻ "Doanh thu" với `GET /admin/reports/summary` trên Swagger (cùng khoảng ngày): bằng nhau.
3. Biểu đồ: mỗi ngày có đơn hoàn thành là một cột; rê chuột vào cột cao nhất thấy "Ngày dd/mm" và số tiền.
4. Bảng bán chạy: 5 dòng, khớp `GET /admin/reports/top-products`; bấm tên sản phẩm sang trang sửa sản phẩm.
5. Bấm "7 ngày": số liệu và biểu đồ đổi theo.
6. Chọn từ 01/01/2025 đến 31/01/2025: "Chưa có đơn hoàn thành trong khoảng thời gian này." và "Chưa có dữ liệu.".
7. Đổi "Từ ngày" thành 01/01/2024: hộp lỗi "Khoảng thời gian tối đa 1 năm" (400 từ API).
8. Ở trang quản lý đơn, chuyển một đơn sang "Đã giao xong" rồi quay lại dashboard: doanh thu tăng đúng tổng tiền đơn đó (task quản lý đơn làm cũ query `['admin', 'reports']`).
9. DevTools → Network, mở trang chủ cửa hàng: không có file `AdminDashboardPage-...js` hay `recharts`. Mở `/admin`: file đó mới được tải.

## Kiểm tra

- [ ] `npm run lint` và `npm run build` trong `web/` đều qua; build có file `AdminDashboardPage-....js` riêng
- [ ] Số liệu các thẻ, biểu đồ, bảng bán chạy khớp với API cho cùng khoảng ngày
- [ ] Đổi khoảng ngày, nút nhanh, trạng thái rỗng, lỗi quá 1 năm đều đúng
- [ ] Giải thích được: vì sao chọn Recharts; vì sao tính "hôm nay" theo giờ Việt Nam; `lazy` + `Suspense` giúp gì
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Vẽ thêm số đơn mỗi ngày trên cùng biểu đồ: thêm `<Line dataKey="orders" yAxisId="orders" />` và một `<YAxis yAxisId="orders" orientation="right" />` (đổi `BarChart` thành `ComposedChart`).
2. Đưa khoảng ngày lên URL (`/admin?from=...&to=...`) bằng `useSearchParams` như các trang danh sách, để gửi link báo cáo cho người khác.
