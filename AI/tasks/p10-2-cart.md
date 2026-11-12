## Mục tiêu

Giỏ hàng chạy hoàn toàn trên trình duyệt:

- Trang chi tiết: nút "Thêm vào giỏ" hoạt động (số lượng không vượt tồn kho, hết hàng thì không bấm được).
- Header: "Giỏ hàng" kèm số sản phẩm trong giỏ.
- Trang `/gio-hang`: danh sách, tăng/giảm số lượng, xoá, tạm tính, giỏ trống; nút "Đặt hàng".
- "Đặt hàng" sang `/thanh-toan` (**cần đăng nhập**). Ở task này `/thanh-toan` chỉ là trang tạm; Phần 11 làm trang thanh toán thật và API đặt hàng.
- Giỏ được lưu trong `localStorage`: tải lại trang, đóng tab mở lại vẫn còn.

**Làm sau:** task "Trang chi tiết sản phẩm" (nút Thêm vào giỏ) và task "Trang đăng ký, đăng nhập..." (`RequireAuth`).

**Đọc trước:** https://react.dev/learn/updating-arrays-in-state; https://react.dev/learn/scaling-up-with-reducer-and-context.

## Giỏ hàng lưu ở đâu?

| Cách | Ưu | Nhược |
|---|---|---|
| **localStorage** (task này) | Không cần đăng nhập, không cần API, nhanh | Mỗi trình duyệt một giỏ; đổi máy là mất |
| Bảng `Carts` trong database | Đăng nhập máy nào cũng thấy | Thêm bảng, API, đồng bộ khi đăng nhập |

Dự án chọn localStorage cho gọn (schema không có bảng giỏ hàng). Một dòng trong giỏ lưu `variantId` làm khoá, vì Phần 11 sẽ gửi lên API `items: [{ variantId, quantity }]`.

Giỏ cũng lưu **bản sao** tên, giá, ảnh, tồn kho lúc thêm, chỉ để hiển thị. Giá hoặc tồn kho có thể đã đổi khi khách bấm đặt hàng, nên **API đặt hàng ở Phần 11 sẽ đọc lại giá và tồn kho thật** trong database, không bao giờ tin con số từ trình duyệt gửi lên.

## Bước 1: Context của giỏ

Tạo `web/src/cart/cart-context.ts`:

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

`Omit<CartItem, 'quantity'>`: kiểu `CartItem` bỏ đi field `quantity`; số lượng truyền riêng vì nó được cộng dồn và giới hạn theo tồn kho.

## Bước 2: `CartProvider`

Tạo `web/src/cart/CartProvider.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { CartContext, type CartItem, type CartState } from './cart-context.ts'

const STORAGE_KEY = 'techstore_cart'

// Read the saved cart. localStorage only holds strings, and the value may be
// missing or broken (edited by hand, old format...), so never trust it blindly.
function loadCart(): CartItem[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(saved) ? (saved as CartItem[]) : []
  } catch {
    return []
  }
}

// Keep quantity between 1 and the stock we know about
const clamp = (quantity: number, stock: number) => Math.max(1, Math.min(quantity, stock))

export default function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCart)

  // Save after every change, so the cart survives a reload or closing the tab
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const value: CartState = {
    items,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),

    addItem: (item, quantity) => {
      const existing = items.find((i) => i.variantId === item.variantId)
      const newQuantity = clamp((existing?.quantity ?? 0) + quantity, item.stock)
      // Never change state in place: build a new array so React sees the change
      setItems(
        existing
          ? items.map((i) => (i.variantId === item.variantId ? { ...item, quantity: newQuantity } : i))
          : [...items, { ...item, quantity: newQuantity }],
      )
      return newQuantity
    },

    updateQuantity: (variantId, quantity) =>
      setItems(items.map((i) => (i.variantId === variantId ? { ...i, quantity: clamp(quantity, i.stock) } : i))),

    removeItem: (variantId) => setItems(items.filter((i) => i.variantId !== variantId)),

    clear: () => setItems([]),
  }

  return <CartContext value={value}>{children}</CartContext>
}
```

Giải thích:
- `useState<CartItem[]>(loadCart)`: truyền **tên hàm** (không gọi), React chỉ đọc localStorage một lần lúc khởi tạo.
- `loadCart` bọc `try/catch` và kiểm tra là mảng: dữ liệu trong localStorage có thể hỏng (sửa tay, bản cũ...), trang không được chết vì nó.
- `useEffect(..., [items])`: mỗi khi `items` đổi thì ghi lại localStorage. Đây là cách "đồng bộ ra ngoài React" đúng nghĩa của `useEffect`.
- **Không sửa mảng tại chỗ** (`items.push`, `item.quantity++`): React so sánh tham chiếu, sửa tại chỗ thì React không biết có thay đổi và không vẽ lại. Luôn tạo mảng/object mới bằng `map`, `filter`, `[...items, x]`, `{ ...item, quantity }`.
- `totalQuantity`, `subtotal` **tính ra** từ `items` mỗi lần vẽ, không lưu thành state riêng (giống cách trang chi tiết chỉ lưu `selectedId`).
- `clamp`: số lượng luôn từ 1 tới tồn kho đã biết. Thêm sản phẩm đã có trong giỏ thì cộng dồn vào đúng dòng đó.
- `addItem` trả về số lượng đang có trong giỏ, để trang chi tiết báo "đang có 4 sản phẩm này".

## Bước 3: Trang giỏ hàng và trang thanh toán tạm

Tạo `web/src/pages/CartPage.tsx`:

```tsx
import { Link, useNavigate } from 'react-router'
import { useCart } from '../cart/cart-context.ts'
import { formatPrice } from '../lib/format.ts'

export default function CartPage() {
  const { items, subtotal, totalQuantity, updateQuantity, removeItem } = useCart()
  const navigate = useNavigate()

  if (items.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-10 text-center shadow-sm">
        <h1 className="text-xl font-bold">Giỏ hàng trống</h1>
        <p className="mt-2 text-slate-500">Hãy chọn vài món bạn thích nhé.</p>
        <Link to="/san-pham" className="mt-4 inline-block rounded-lg bg-amber-400 px-4 py-2 font-medium">
          Tiếp tục mua sắm
        </Link>
      </section>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h1 className="mb-4 text-xl font-bold">Giỏ hàng ({totalQuantity} sản phẩm)</h1>
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.variantId} className="flex gap-4 py-4">
              <img
                src={item.thumbnailUrl ?? ''}
                alt={item.productName}
                className="h-20 w-20 shrink-0 rounded-lg bg-slate-100 object-cover"
              />
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <Link to={`/san-pham/${item.productSlug}`} className="font-medium hover:underline">
                    {item.productName}
                  </Link>
                  <p className="text-sm text-slate-500">{item.variantName}</p>
                  <p className="text-sm font-semibold text-red-600">{formatPrice(item.unitPrice)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center rounded-lg border border-slate-300">
                    <button
                      type="button"
                      aria-label={`Giảm ${item.productName}`}
                      className="px-3 py-1 disabled:opacity-40"
                      disabled={item.quantity <= 1}
                      onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                    >
                      −
                    </button>
                    <span className="w-8 text-center">{item.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Tăng ${item.productName}`}
                      className="px-3 py-1 disabled:opacity-40"
                      disabled={item.quantity >= item.stock}
                      onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.variantId)}
                    className="text-sm text-slate-500 hover:text-red-600"
                  >
                    Xoá
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <aside className="h-fit rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex justify-between text-sm">
          <span>Tạm tính</span>
          <span className="font-semibold">{formatPrice(subtotal)}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">Giá và tồn kho được kiểm tra lại khi đặt hàng.</p>
        <button
          type="button"
          onClick={() => navigate('/thanh-toan')}
          className="mt-4 w-full rounded-lg bg-red-600 py-3 font-semibold text-white hover:bg-red-700"
        >
          Đặt hàng
        </button>
      </aside>
    </div>
  )
}
```

Tạo `web/src/pages/CheckoutPage.tsx`:

```tsx
import { Link } from 'react-router'
import { useCart } from '../cart/cart-context.ts'
import { formatPrice } from '../lib/format.ts'

// Placeholder behind <RequireAuth>: Part 11 builds the real checkout (address, payment, POST /orders)
export default function CheckoutPage() {
  const { totalQuantity, subtotal } = useCart()

  return (
    <section className="mx-auto max-w-lg rounded-2xl bg-white p-6 text-center shadow-sm">
      <h1 className="text-xl font-bold">Thanh toán</h1>
      <p className="mt-2 text-slate-500">
        {totalQuantity} sản phẩm, tạm tính {formatPrice(subtotal)}.
      </p>
      <p className="mt-2 text-sm text-slate-500">Trang này sẽ được hoàn thiện ở Phần 11 (đặt hàng).</p>
      <Link to="/gio-hang" className="mt-4 inline-block text-amber-700 underline">
        Quay lại giỏ hàng
      </Link>
    </section>
  )
}
```

- ``aria-label={`Tăng ${item.productName}`}``: mỗi nút có tên riêng, trình đọc màn hình (và test tự động) phân biệt được nút của từng dòng.
- `/gio-hang` ai cũng xem được; chỉ `/thanh-toan` cần đăng nhập (Bước 5). Khách xem giỏ trước, tới lúc đặt mới phải đăng nhập.

## Bước 4: Nút "Thêm vào giỏ"

Trong `web/src/pages/ProductDetailPage.tsx`:

1. Thêm import: `import { useCart } from '../cart/cart-context.ts'`
2. Trong `ProductView`, ngay dưới `const [quantity, setQuantity] = useState(1)`:

   ```tsx
     const { addItem } = useCart()
     const [addedMessage, setAddedMessage] = useState('')
   ```

3. Trong `choose(...)`, thêm `setAddedMessage('')` cạnh `setQuantity(1)`, và thêm hàm `handleAddToCart` ngay sau `choose`.
4. Thay nút "Thêm vào giỏ" đang `disabled` bằng nút thật và dòng thông báo.

File hoàn chỉnh:

```tsx
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useCart } from '../cart/cart-context.ts'
import ErrorBox from '../components/ErrorBox.tsx'
import { ApiError } from '../lib/api.ts'
import { formatPrice } from '../lib/format.ts'
import { useProduct } from '../lib/queries.ts'
import type { ProductDetail, ProductVariant } from '../lib/types.ts'
import NotFoundPage from './NotFoundPage.tsx'

// Vietnamese labels for the keys stored in Products.specs (JSON)
const SPEC_LABELS: Record<string, string> = {
  screen: 'Màn hình',
  chip: 'Chip',
  cpu: 'CPU',
  gpu: 'Card đồ hoạ',
  ram: 'RAM',
  storage: 'Bộ nhớ',
  rearCamera: 'Camera sau',
  frontCamera: 'Camera trước',
  battery: 'Pin',
  capacity: 'Dung lượng',
  charging: 'Sạc',
  power: 'Công suất',
  port: 'Cổng',
  ports: 'Cổng kết nối',
  connection: 'Kết nối',
  standard: 'Chuẩn',
  type: 'Loại',
  os: 'Hệ điều hành',
  weight: 'Trọng lượng',
}

// Price the customer pays for a variant
const effectivePrice = (variant: ProductVariant) => variant.salePrice ?? variant.price

// Distinct non-empty values in their original order, e.g. every color once
function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

export default function ProductDetailPage() {
  const { slug = '' } = useParams()
  const { data: product, isPending, isError, error, refetch } = useProduct(slug)

  if (isPending) {
    return <div className="h-96 animate-pulse rounded-2xl bg-slate-200" aria-busy="true" />
  }
  if (isError) {
    // Unknown or hidden product: the API answers 404
    if (error instanceof ApiError && error.status === 404) return <NotFoundPage />
    return <ErrorBox error={error} onRetry={() => refetch()} />
  }
  // key={product.id}: moving to another product creates a fresh ProductView,
  // so its state (chosen variant, image, quantity) starts over
  return <ProductView key={product.id} product={product} />
}

function ProductView({ product }: { product: ProductDetail }) {
  const { variants } = product
  // Start with the cheapest variant that is in stock (variants come sorted by price)
  const [selectedId, setSelectedId] = useState(
    () => (variants.find((v) => v.stock > 0) ?? variants[0])?.id,
  )
  const [imageIndex, setImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const { addItem } = useCart()
  const [addedMessage, setAddedMessage] = useState('')

  const selected = variants.find((v) => v.id === selectedId)
  const colors = unique(variants.map((v) => v.color))
  const storages = unique(variants.map((v) => v.storage))
  const images = product.images.length > 0 ? product.images.map((image) => image.url) : [product.thumbnailUrl ?? '']

  // Keep the other option when possible: pick "Bạc" while on 512GB -> "512GB - Bạc" if it exists
  function choose(change: { color?: string; storage?: string }) {
    const color = change.color ?? selected?.color
    const storage = change.storage ?? selected?.storage
    const match =
      variants.find((v) => v.color === color && v.storage === storage) ??
      variants.find((v) => (change.color ? v.color === change.color : v.storage === change.storage))
    if (match) {
      setSelectedId(match.id)
      setQuantity(1)
      setAddedMessage('')
    }
  }

  function handleAddToCart() {
    if (!selected) return
    const inCart = addItem(
      {
        variantId: selected.id,
        productSlug: product.slug,
        productName: product.name,
        variantName: selected.name,
        unitPrice: effectivePrice(selected),
        thumbnailUrl: product.thumbnailUrl,
        stock: selected.stock,
      },
      quantity,
    )
    setAddedMessage(`Đã thêm vào giỏ (đang có ${inCart} sản phẩm này)`)
  }

  const optionClass = (active: boolean) =>
    `rounded-lg border px-3 py-2 text-sm ${active ? 'border-amber-500 bg-amber-50 font-semibold' : 'border-slate-300 bg-white'}`

  return (
    <div className="space-y-8">
      <nav className="text-sm text-slate-500">
        <Link to="/" className="hover:underline">
          Trang chủ
        </Link>{' '}
        /{' '}
        <Link to={`/san-pham?category=${product.category.slug}`} className="hover:underline">
          {product.category.name}
        </Link>{' '}
        / <span className="text-slate-700">{product.name}</span>
      </nav>

      <div className="grid gap-8 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-2 md:p-6">
        <div>
          <img
            src={images[imageIndex]}
            alt={product.name}
            className="aspect-square w-full rounded-xl bg-slate-100 object-cover"
          />
          {images.length > 1 && (
            <div className="mt-3 flex gap-2">
              {images.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setImageIndex(index)}
                  className={`h-16 w-16 overflow-hidden rounded-lg border-2 ${
                    index === imageIndex ? 'border-amber-500' : 'border-transparent'
                  }`}
                >
                  <img src={url} alt={`Ảnh ${index + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">{product.brand.name}</p>
            <h1 className="mt-1 text-2xl font-bold">{product.name}</h1>
            {product.shortDescription && <p className="mt-2 text-slate-600">{product.shortDescription}</p>}
          </div>

          {selected && (
            <div>
              <p className="text-3xl font-bold text-red-600">{formatPrice(effectivePrice(selected))}</p>
              {selected.salePrice !== null && (
                <p className="text-slate-400 line-through">{formatPrice(selected.price)}</p>
              )}
            </div>
          )}

          {storages.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Phiên bản</p>
              <div className="flex flex-wrap gap-2">
                {storages.map((storage) => (
                  <button
                    key={storage}
                    type="button"
                    onClick={() => choose({ storage })}
                    className={optionClass(selected?.storage === storage)}
                  >
                    {storage}
                  </button>
                ))}
              </div>
            </div>
          )}

          {colors.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Màu sắc</p>
              <div className="flex flex-wrap gap-2">
                {colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => choose({ color })}
                    className={optionClass(selected?.color === color)}
                  >
                    {color}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selected && (
            <p className={`text-sm ${selected.stock > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {selected.stock > 0 ? `Còn ${selected.stock} sản phẩm` : 'Tạm hết hàng'}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-lg border border-slate-300 bg-white">
              <button
                type="button"
                aria-label="Giảm số lượng"
                className="px-3 py-2 disabled:opacity-40"
                disabled={quantity <= 1}
                onClick={() => setQuantity(quantity - 1)}
              >
                −
              </button>
              <span className="w-10 text-center" aria-label="Số lượng">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="Tăng số lượng"
                className="px-3 py-2 disabled:opacity-40"
                disabled={!selected || quantity >= selected.stock}
                onClick={() => setQuantity(quantity + 1)}
              >
                +
              </button>
            </div>
            <button
              type="button"
              disabled={!selected || selected.stock === 0}
              onClick={handleAddToCart}
              className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Thêm vào giỏ
            </button>
          </div>
          {addedMessage && (
            <p role="status" className="text-sm text-emerald-700">
              {addedMessage}.{' '}
              <Link to="/gio-hang" className="font-medium underline">
                Xem giỏ hàng
              </Link>
            </p>
          )}
        </div>
      </div>

      {product.specs && (
        <section className="rounded-2xl bg-white p-4 shadow-sm md:p-6">
          <h2 className="mb-3 text-lg font-bold">Thông số kỹ thuật</h2>
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(product.specs).map(([key, value]) => (
                <tr key={key} className="border-b border-slate-100 last:border-0">
                  <th className="w-1/3 py-2 pr-4 text-left font-normal text-slate-500">{SPEC_LABELS[key] ?? key}</th>
                  <td className="py-2">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
```

- `variantName: selected.name`: cột `ProductVariants.name` đã có sẵn tên đọc được ("256GB - Cam vũ trụ").
- `unitPrice: effectivePrice(selected)`: giá sau giảm lúc thêm.
- `disabled={!selected || selected.stock === 0}`: hết hàng thì không thêm được.
- Ô số lượng giữ nguyên sau khi thêm: chọn 2 rồi bấm "Thêm vào giỏ" hai lần là 4.

## Bước 5: Nối vào app

Thay toàn bộ `web/src/App.tsx` (thêm `/gio-hang` và `/thanh-toan` có `RequireAuth`):

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
        {/* "*" matches any URL not listed above */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
```

Thay toàn bộ `web/src/main.tsx` (bọc `CartProvider`):

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import AuthProvider from './auth/AuthProvider.tsx'
import CartProvider from './cart/CartProvider.tsx'
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
        {/* The cart: available everywhere through useCart() */}
        <CartProvider>
          {/* Lets every component read and change the URL (<Link>, useParams, useNavigate...) */}
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
```

Thay toàn bộ `web/src/components/Header.tsx` (link giỏ hàng có số):

```tsx
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/auth-context.ts'
import { useCart } from '../cart/cart-context.ts'
import { useCategories } from '../lib/queries.ts'

export default function Header() {
  const { user, logout } = useAuth()
  const { totalQuantity } = useCart()
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
          <Link to="/gio-hang" className="relative hover:underline">
            Giỏ hàng
            {totalQuantity > 0 && (
              <span
                aria-label={`${totalQuantity} sản phẩm trong giỏ`}
                className="ml-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white"
              >
                {totalQuantity}
              </span>
            )}
          </Link>
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

## Bước 6: Chạy thử

1. Mở `/san-pham/iphone-17-pro-max`, tăng số lượng lên 2, "Thêm vào giỏ": "Đã thêm vào giỏ (đang có 2 sản phẩm này)", header hiện số **2**.
2. Bấm "Thêm vào giỏ" lần nữa: đang có 4. Chọn **1TB**, bấm `+` tới khi dừng ở 4, thêm vào giỏ hai lần: vẫn 4 (tồn kho chỉ có 4). Header: **8**.
3. Mở `/gio-hang`: 2 dòng, tạm tính **351.920.000 ₫** (4 × 36.990.000 + 4 × 50.990.000). Nút `+` của dòng 1TB bị mờ.
4. Giảm một dòng, F5: giỏ vẫn còn. DevTools → Application → Local Storage → `techstore_cart` chứa JSON của giỏ.
5. Chưa đăng nhập, bấm "Đặt hàng": sang `/dang-nhap?redirect=%2Fthanh-toan`; đăng nhập xong vào `/thanh-toan` (trang tạm ghi số sản phẩm và tạm tính).
6. Xoá hết: "Giỏ hàng trống", header không còn số.
7. Console: `localStorage.setItem('techstore_cart', '{broken')`, F5: giỏ trống, trang không lỗi.

## Kiểm tra

- [ ] `npm run lint` và `npm run build` trong `web/` đều qua
- [ ] Thêm, tăng, giảm, xoá đúng; số lượng không vượt tồn kho; giỏ còn sau khi tải lại
- [ ] "Đặt hàng" khi chưa đăng nhập → đăng nhập → quay lại `/thanh-toan`
- [ ] Giải thích được: vì sao phải tạo mảng mới thay vì `items.push`; vì sao server phải tự đọc lại giá khi đặt hàng
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Mở trang ở hai tab, thêm vào giỏ ở tab 1: tab 2 không đổi cho tới khi F5. Sửa bằng sự kiện `storage` của trình duyệt: trong `CartProvider`, `window.addEventListener('storage', ...)` rồi `setItems(loadCart())` khi `event.key === 'techstore_cart'` (nhớ gỡ listener trong hàm dọn dẹp của `useEffect`).
2. Viết lại `CartProvider` bằng `useReducer` với các action `add`, `update`, `remove`, `clear` (xem bài "Scaling Up with Reducer and Context" ở phần Đọc trước). So sánh độ dễ đọc với bản dùng `useState`.
