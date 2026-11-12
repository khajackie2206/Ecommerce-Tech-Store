## Mục tiêu

Trang `/thanh-toan` thật (thay trang tạm của task "Giỏ hàng") và trang đặt hàng thành công:

- Form giao hàng: họ tên người nhận, số điện thoại, địa chỉ, ghi chú, phương thức thanh toán (COD / chuyển khoản). Họ tên và số điện thoại điền sẵn từ tài khoản.
- Tóm tắt đơn: các dòng trong giỏ, tạm tính, **phí giao hàng xem trước** (miễn phí từ 2.000.000 ₫, còn lại 30.000 ₫), tổng cộng.
- Bấm "Đặt hàng" → `POST /api/v1/orders`. Lỗi 400 hiện danh sách; lỗi **409** (không đủ hàng) hiện thông báo của API kèm link "Sửa giỏ hàng".
- Thành công (201) → xoá giỏ, chuyển sang `/dat-hang-thanh-cong/<mã đơn>` hiện mã đơn, tổng tiền, và thông tin chuyển khoản nếu chọn chuyển khoản. Trang này tải lại (F5) vẫn đúng.
- Giỏ hàng không cho quá **10 chiếc mỗi sản phẩm**, đúng giới hạn của API.

**Làm sau:** task "API đặt hàng: transaction trừ tồn kho" (Phần 11, server) và task "Giỏ hàng" (Phần 10). Song song được với task "API lịch sử đơn hàng và huỷ đơn" (server); task "Trang lịch sử đơn hàng" làm sau task này.

**Đọc trước:** https://tanstack.com/query/latest/docs/framework/react/guides/mutations và https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations; nhắc lại `CreateOrderDto` và `OrdersService.create` của task API đặt hàng.

## Đọc dữ liệu và ghi dữ liệu trong TanStack Query

| | `useQuery` (Phần 9) | `useMutation` (task này) |
|---|---|---|
| Dùng cho | Đọc: `GET` | Ghi: `POST`, `PATCH`, `DELETE` |
| Chạy khi nào | Tự chạy khi component hiện | Chỉ chạy khi gọi `mutate(...)` / `mutateAsync(...)` |
| Kết quả | `data`, `isPending`, `isError` | `isPending` (đang gửi), `isError`, `data`, `error` |

Sau khi đặt hàng, tồn kho trong database đã đổi, nhưng cache của trình duyệt vẫn giữ số cũ ("Còn 25 sản phẩm"). `invalidateQueries({ queryKey: ['products'] })` đánh dấu mọi query có khoá bắt đầu bằng `products` là **cũ**: trang nào đang dùng thì tự tải lại, trang khác sẽ tải lại khi mở.

## Bước 1: Kiểu dữ liệu của đơn hàng

Trong `web/src/lib/types.ts`, thêm vào **cuối file** các kiểu `Paginated`, `OrderStatus`, `PaymentMethod`, `OrderItem`, `Order`, `CreateOrderInput`. File hoàn chỉnh:

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

// Every paginated list of the API (orders, admin lists): Paginated<T> in server/src/common
export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  limit: number
}

export type OrderStatus = 'pending' | 'confirmed' | 'shipping' | 'completed' | 'cancelled'
export type PaymentMethod = 'cod' | 'bank_transfer'

// One line of an order: name and price copied at the time of purchase
export type OrderItem = {
  id: number
  variantId: number
  productName: string
  variantName: string
  unitPrice: number
  quantity: number
}

export type Order = {
  id: string
  code: string // e.g. TS261111DDWLCN, shown to customers
  status: OrderStatus
  paymentMethod: PaymentMethod
  subtotal: number
  shippingFee: number
  total: number
  shippingName: string
  shippingPhone: string
  shippingAddress: string
  note: string | null
  items: OrderItem[]
  createdAt: string
  updatedAt: string
}

// Body of POST /orders: only ids and quantities, the server looks up prices itself
export type CreateOrderInput = {
  items: { variantId: number; quantity: number }[]
  shippingName: string
  shippingPhone: string
  shippingAddress: string
  note?: string
  paymentMethod: PaymentMethod
}
```

Các kiểu này chép từ entity `Order`, `OrderItem` và `CreateOrderDto` bên server. `id` của đơn là chuỗi (GUID), còn khách chỉ thấy `code` (`TS261111...`).

## Bước 2: Giới hạn 10 chiếc mỗi sản phẩm

API từ chối dòng nào có `quantity > 10` (`@Max(10)` trong `OrderLineDto`). Giỏ hàng nên chặn trước, khách khỏi bị lỗi lúc đặt.

Thay toàn bộ `web/src/cart/cart-context.ts` (thêm `MAX_PER_ITEM`, `maxQuantity`):

```ts
import { createContext, useContext } from 'react'

// One line of the cart. variantId is the key: Part 11 sends [{ variantId, quantity }] to the API.
// Name, price and image are copies taken when the item was added, only for display:
// the server re-reads the real price and stock when the order is placed.
export type CartItem = {
  variantId: number
  productSlug: string
  productName: string
  variantName: string // e.g. "256GB - Cam vũ trụ"
  unitPrice: number // price after discount
  thumbnailUrl: string | null
  quantity: number
  stock: number // upper limit for quantity
}

// Same limit as CreateOrderDto on the server: "Mỗi sản phẩm mua tối đa 10 chiếc"
export const MAX_PER_ITEM = 10

// Most a line can hold: what is in stock, but never more than the per-order limit
export const maxQuantity = (stock: number) => Math.min(stock, MAX_PER_ITEM)

export type CartState = {
  items: CartItem[]
  totalQuantity: number // number on the header badge
  subtotal: number
  // Adds (or increases) a line; quantity is capped by stock. Returns the quantity now in the cart.
  addItem: (item: Omit<CartItem, 'quantity'>, quantity: number) => number
  updateQuantity: (variantId: number, quantity: number) => void
  removeItem: (variantId: number) => void
  clear: () => void
}

export const CartContext = createContext<CartState | null>(null)

export function useCart(): CartState {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart() must be used inside <CartProvider>')
  return value
}
```

Trong `web/src/cart/CartProvider.tsx`, đổi dòng import và hàm `clamp`:

```tsx
import { CartContext, maxQuantity, type CartItem, type CartState } from './cart-context.ts'
```

```tsx
// Keep quantity between 1 and maxQuantity(stock)
const clamp = (quantity: number, stock: number) => Math.max(1, Math.min(quantity, maxQuantity(stock)))
```

Trong `web/src/pages/CartPage.tsx` và `web/src/pages/ProductDetailPage.tsx`: import thêm `maxQuantity` từ `'../cart/cart-context.ts'`, và đổi điều kiện tắt nút `+`:

```tsx
// CartPage.tsx
disabled={item.quantity >= maxQuantity(item.stock)}

// ProductDetailPage.tsx
disabled={!selected || quantity >= maxQuantity(selected.stock)}
```

Hằng số cùng một quy tắc nằm ở hai nơi (server và web) là chuyện bình thường; ghi chú rõ để khi đổi thì đổi cả hai. Server vẫn là nơi quyết định cuối cùng.

## Bước 3: Phí giao hàng và các hook đơn hàng

Tạo `web/src/lib/shipping.ts`:

```ts
// Copy of the rule in server/src/orders/orders.service.ts (FREE_SHIPPING_FROM, SHIPPING_FEE).
// Used only to PREVIEW the fee: the server computes the real one when the order is placed.
// Change both places together.
export const FREE_SHIPPING_FROM = 2_000_000
export const SHIPPING_FEE = 30_000

export function shippingFeeFor(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE
}
```

Phí ở đây chỉ để **xem trước**. Server tự tính lại phí và tổng tiền từ giá trong database (`OrdersService.create`), không đọc con số nào từ trình duyệt.

Tạo `web/src/lib/orders.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api.ts'
import type { CreateOrderInput, Order } from './types.ts'

// Orders of the logged-in customer (routes /orders of the API, all need a token)

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
      // We already have the new order: put it in the cache for the success page
      queryClient.setQueryData(['order', order.code], order)
    },
  })
}
```

- `useMyOrder(code)`: `GET /orders/:code` cho trang thành công (task sau dùng tiếp cho trang chi tiết đơn).
- `useCreateOrder()`: `mutationFn` gửi `POST /orders`. `onSuccess` chạy sau khi API trả 201:
  - `invalidateQueries` cho `products` và `product`: tồn kho đã đổi.
  - `setQueryData(['order', code], order)`: API đã trả nguyên đơn hàng, đặt sẵn vào cache để trang thành công hiện ngay, không phải gọi thêm.

## Bước 4: Trang thanh toán

Thay toàn bộ `web/src/pages/CheckoutPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/auth-context.ts'
import { useCart } from '../cart/cart-context.ts'
import FormErrors from '../components/FormErrors.tsx'
import { ApiError } from '../lib/api.ts'
import { formatPrice } from '../lib/format.ts'
import { useCreateOrder } from '../lib/orders.ts'
import { FREE_SHIPPING_FROM, shippingFeeFor } from '../lib/shipping.ts'
import type { PaymentMethod } from '../lib/types.ts'

const INPUT = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-amber-500'

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; hint: string }[] = [
  { value: 'cod', label: 'Thanh toán khi nhận hàng (COD)', hint: 'Trả tiền mặt cho nhân viên giao hàng' },
  { value: 'bank_transfer', label: 'Chuyển khoản ngân hàng', hint: 'Thông tin tài khoản hiện sau khi đặt hàng' },
]

// Behind <RequireAuth> in App.tsx: user is always set here
export default function CheckoutPage() {
  const { user } = useAuth()
  const { items, subtotal, clear } = useCart()
  const createOrder = useCreateOrder()
  const navigate = useNavigate()

  // Pre-filled from the account, editable (the order may go to someone else)
  const [form, setForm] = useState({
    shippingName: user?.fullName ?? '',
    shippingPhone: user?.phone ?? '',
    shippingAddress: '',
    note: '',
    paymentMethod: 'cod' as PaymentMethod,
  })
  const [errors, setErrors] = useState<string[]>([])
  // 409 = not enough stock: the cart must be fixed before trying again
  const [stockProblem, setStockProblem] = useState(false)
  const update = (field: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm({ ...form, [field]: event.target.value })

  if (items.length === 0) {
    return (
      <section className="mx-auto max-w-lg rounded-2xl bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold">Giỏ hàng trống</h1>
        <Link to="/san-pham" className="mt-4 inline-block text-amber-700 underline">
          Tiếp tục mua sắm
        </Link>
      </section>
    )
  }

  const shippingFee = shippingFeeFor(subtotal)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors([])
    setStockProblem(false)
    try {
      const order = await createOrder.mutateAsync({
        // Only ids and quantities: prices are looked up again by the server
        items: items.map(({ variantId, quantity }) => ({ variantId, quantity })),
        shippingName: form.shippingName.trim(),
        shippingPhone: form.shippingPhone.trim(),
        shippingAddress: form.shippingAddress.trim(),
        note: form.note.trim() || undefined,
        paymentMethod: form.paymentMethod,
      })
      navigate(`/dat-hang-thanh-cong/${order.code}`, { replace: true })
      clear()
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.messages)
        setStockProblem(error.status === 409)
      } else {
        setErrors(['Có lỗi xảy ra, vui lòng thử lại'])
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">Thông tin giao hàng</h1>
        <FormErrors messages={errors} />
        {stockProblem && (
          <p className="text-sm">
            Sản phẩm vừa hết hoặc không đủ số lượng.{' '}
            <Link to="/gio-hang" className="font-medium text-amber-700 underline">
              Sửa giỏ hàng
            </Link>
          </p>
        )}
        <label className="block text-sm">
          Họ tên người nhận
          <input value={form.shippingName} onChange={update('shippingName')} className={INPUT} autoComplete="name" />
        </label>
        <label className="block text-sm">
          Số điện thoại
          <input
            type="tel"
            value={form.shippingPhone}
            onChange={update('shippingPhone')}
            className={INPUT}
            autoComplete="tel"
            placeholder="0901234567"
          />
        </label>
        <label className="block text-sm">
          Địa chỉ nhận hàng
          <textarea
            value={form.shippingAddress}
            onChange={update('shippingAddress')}
            rows={2}
            className={INPUT}
            autoComplete="street-address"
            placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"
          />
        </label>
        <label className="block text-sm">
          Ghi chú (không bắt buộc)
          <input value={form.note} onChange={update('note')} className={INPUT} placeholder="Giao giờ hành chính..." />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Phương thức thanh toán</legend>
          {PAYMENT_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${
                form.paymentMethod === option.value ? 'border-amber-500 bg-amber-50' : 'border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value={option.value}
                checked={form.paymentMethod === option.value}
                onChange={update('paymentMethod')}
              />
              <span>
                <span className="font-medium">{option.label}</span>
                <span className="block text-slate-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </section>

      <aside className="h-fit space-y-3 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-bold">Đơn hàng ({items.length} sản phẩm)</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {items.map((item) => (
            <li key={item.variantId} className="flex justify-between gap-3 py-2">
              <span>
                {item.productName}
                <span className="block text-slate-500">
                  {item.variantName} × {item.quantity}
                </span>
              </span>
              <span className="whitespace-nowrap">{formatPrice(item.unitPrice * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t border-slate-200 pt-3 text-sm">
          <div className="flex justify-between">
            <dt>Tạm tính</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Phí giao hàng</dt>
            <dd>{shippingFee === 0 ? 'Miễn phí' : formatPrice(shippingFee)}</dd>
          </div>
          {shippingFee > 0 && (
            <p className="text-xs text-slate-500">Miễn phí giao hàng cho đơn từ {formatPrice(FREE_SHIPPING_FROM)}</p>
          )}
          <div className="flex justify-between pt-2 text-base font-bold">
            <dt>Tổng cộng</dt>
            <dd className="text-red-600">{formatPrice(subtotal + shippingFee)}</dd>
          </div>
        </dl>
        <button
          type="submit"
          disabled={createOrder.isPending}
          className="w-full rounded-lg bg-red-600 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {createOrder.isPending ? 'Đang đặt hàng...' : 'Đặt hàng'}
        </button>
        <p className="text-xs text-slate-500">Giá và tồn kho được kiểm tra lại khi đặt hàng.</p>
      </aside>
    </form>
  )
}
```

Giải thích:
- Trang nằm sau `<RequireAuth>` (đã khai báo ở task "Giỏ hàng"), nên `user` luôn có. `useState({ shippingName: user?.fullName ?? '', ... })` điền sẵn, khách vẫn sửa được (gửi quà cho người khác).
- `items.map(({ variantId, quantity }) => ...)`: chỉ gửi id và số lượng. Tên, giá trong giỏ là bản sao để hiển thị, server không dùng.
- `mutateAsync` trả về Promise: `await` được, lỗi thì nhảy vào `catch`. (`mutate` thì không trả Promise, dùng khi không cần chờ kết quả.)
- `error.status === 409`: API báo không đủ hàng, ví dụ `"iPhone 17 Pro Max 1TB - Cam vũ trụ" chỉ còn 2 sản phẩm`. Ta hiện câu đó và link "Sửa giỏ hàng" để khách giảm số lượng.
- Lỗi 400 của dòng sản phẩm có tiền tố vị trí, ví dụ `items.0.Mỗi sản phẩm mua tối đa 10 chiếc`: đó là cách class-validator báo lỗi trong mảng (`@ValidateNested`). Bước 2 đã chặn trường hợp này từ giỏ hàng.
- Thành công: `navigate(..., { replace: true })` rồi `clear()`. `replace` để bấm Back không quay lại trang thanh toán của một giỏ đã đặt rồi.
- Ô thanh toán là `<input type="radio">` chung `name`, có kiểm soát bằng `checked`.

## Bước 5: Trang đặt hàng thành công

Tạo `web/src/pages/OrderSuccessPage.tsx`:

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
        <Link to="/san-pham" className="rounded-lg bg-amber-400 px-4 py-2 font-medium">
          Tiếp tục mua sắm
        </Link>
      </div>
    </section>
  )
}
```

Trang đọc mã đơn từ URL và gọi `useMyOrder(code)`. Vừa đặt xong thì dữ liệu đã nằm sẵn trong cache (Bước 3); F5 thì gọi `GET /orders/:code`. Không dùng `navigate(..., { state: { order } })` để truyền đơn hàng: state đó mất khi tải lại trang.

Thay toàn bộ `web/src/App.tsx` (thêm route `/dat-hang-thanh-cong/:code`, cần đăng nhập):

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

## Bước 6: Chạy thử

Đăng nhập bằng một tài khoản khách:
1. Giỏ trống mà mở `/thanh-toan`: "Giỏ hàng trống".
2. Trang chi tiết iPhone 17 Pro Max, bấm `+` liên tục: dừng ở **10** dù còn 25 chiếc.
3. Thêm 1 "Pin sạc dự phòng Xiaomi" (420.000 ₫) rồi mở `/thanh-toan`: phí giao hàng **30.000 ₫**, tổng **450.000 ₫**, dòng nhắc "Miễn phí giao hàng cho đơn từ 2.000.000 ₫".
4. Xoá họ tên, số điện thoại `123`, để trống địa chỉ, bấm Đặt hàng: hộp lỗi
   - Tên người nhận không được để trống
   - Số điện thoại phải gồm 10 số, bắt đầu bằng 0
   - Địa chỉ không được để trống
5. Thử 409: thêm 3 chiếc iPhone 17 Pro Max **1TB** vào giỏ, rồi trong VS Code (database `TechStoreDb`) chạy

   ```sql
   UPDATE ProductVariants SET stock = 2 WHERE sku = 'IP17PM-1TB-ORG';
   ```

   Điền đủ form, bấm Đặt hàng: `"iPhone 17 Pro Max 1TB - Cam vũ trụ" chỉ còn 2 sản phẩm` và link "Sửa giỏ hàng". Không có gì bị trừ trong database (transaction đã rollback). Trả lại `stock = 4`.
6. Chọn "Chuyển khoản ngân hàng", Đặt hàng: sang `/dat-hang-thanh-cong/TS...`, có "Nội dung chuyển khoản: TS...". Header không còn số giỏ hàng. F5: trang vẫn đúng.
7. Mở lại trang iPhone 17 Pro Max, chọn 1TB: "Còn 1 sản phẩm" (4 - 3), không phải số cũ trong cache.
8. Trong database: `SELECT TOP 1 code, paymentMethod, shippingFee, total FROM Orders ORDER BY createdAt DESC` khớp với trang thành công.

## Kiểm tra

- [ ] `npm run lint` và `npm run build` trong `web/` đều qua
- [ ] Đặt hàng COD và chuyển khoản đều thành công; giỏ được xoá; F5 trang thành công vẫn đúng
- [ ] 400 hiện danh sách lỗi, 409 hiện thông báo + link sửa giỏ; phí giao hàng xem trước khớp với đơn trong database
- [ ] Tồn kho trên trang sản phẩm cập nhật sau khi đặt (không cần F5)
- [ ] Giải thích được: `useMutation` khác `useQuery` thế nào; vì sao phải `invalidateQueries` sau khi đặt hàng; vì sao server không tin giá do trình duyệt gửi
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Nút "Đặt hàng" đã bị tắt khi đang gửi (`isPending`). Thử bỏ `disabled={createOrder.isPending}`, bật DevTools → Network "Slow 4G" và bấm đúp: hai request `POST /orders` được gửi, có thể ra hai đơn giống nhau. Nhớ trả lại. (Làm chặt hơn thì server nhận một "idempotency key" do trình duyệt sinh cho mỗi lần thanh toán.)
2. Thêm ô "Lưu số điện thoại này vào tài khoản" khi tài khoản chưa có số. Gợi ý: cần thêm API `PATCH /auth/me` ở server trước.
