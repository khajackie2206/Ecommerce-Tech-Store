## Mục tiêu

Khu quản trị cho admin, phần sản phẩm, dùng các API admin của Phần 12:

| URL | Trang |
|---|---|
| `/admin` | Tạm chuyển sang `/admin/san-pham` (task "Dashboard" sẽ đặt trang tổng quan ở đây) |
| `/admin/san-pham?q=&categoryId=&page=` | Danh sách 20 sản phẩm/trang: ảnh, tên, nhãn "Đang ẩn"/"Nổi bật", danh mục, hãng, giá từ, tổng tồn kho. Tìm theo tên/slug, lọc theo danh mục |
| `/admin/san-pham/moi` | Tạo sản phẩm **cùng các phiên bản** trong một lần gửi; slug tự sinh từ tên tiếng Việt |
| `/admin/san-pham/:id` | Sửa thông tin, ẩn/hiện, nổi bật; sửa giá, giá KM, tồn kho, bật/tắt từng phiên bản ngay trong bảng; thêm phiên bản; tải ảnh lên, xoá ảnh, chọn ảnh đại diện; xoá sản phẩm |

Khu admin có layout riêng (thanh trên tối màu, menu trái). Khách hàng mở `/admin` thấy trang **403**, chưa đăng nhập thì bị chuyển sang trang đăng nhập. Mọi lỗi 400/409 của API hiện đúng câu chữ tiếng Việt.

**Làm sau:**
- task "API admin: quản lý sản phẩm và phiên bản" và task "Upload ảnh sản phẩm" (server);
- task "Trang đăng ký, đăng nhập..." (Phần 10);
- task "Trang lịch sử đơn hàng" (dùng `PRIVATE_QUERY_KEYS` trong `AuthProvider`).

Hai task "Giao diện admin: quản lý đơn hàng" và "Dashboard admin" dùng `AdminLayout`, `RequireAdmin` của task này, nên làm sau.

**Đọc trước:** https://react.dev/learn/sharing-state-between-components (lifting state up); https://developer.mozilla.org/en-US/docs/Web/API/FormData; nhắc lại các route trong `admin-products.controller.ts`, `admin-variants.controller.ts`, `admin-images.controller.ts`.

## Ba ý mới trong task này

1. **Ẩn trang admin ở web chưa phải là bảo mật.** `RequireAdmin` chỉ tránh cho khách thấy một trang đầy lỗi. Bảo mật thật là `@Roles('admin')` trên API (Phần 7): ai sửa JavaScript để vào được trang cũng chỉ nhận 403 từ API.
2. **Form giữ chuỗi, gửi đi mới đổi sang số.** `<input>` luôn trả về chuỗi (`"18990000"`). Form lưu chuỗi trong state (ô trống là `""`, không phải `0`), hàm `toProductInput` / `toVariantInput` đổi sang đúng kiểu API cần ngay trước khi gửi.
3. **"Đưa state lên cha" (lifting state up).** Trang tạo và trang sửa dùng chung component `ProductFields`, nhưng state nằm ở **trang**: `ProductFields` chỉ nhận `value` và báo `onChange`. Nhờ vậy trang tạo gửi được sản phẩm + phiên bản trong một request, trang sửa tự quyết định khi nào gọi API.

## Bước 1: `lib/api.ts` gửi được file

Upload ảnh dùng `multipart/form-data`, không phải JSON. Trong `web/src/lib/api.ts`, thay dòng đặt `Content-Type` bằng:

```ts
  // FormData (file upload) is sent as multipart/form-data: the browser writes that
  // Content-Type itself, with the boundary between parts. Everything else is JSON.
  const isForm = body instanceof FormData
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
```

và dòng `body:` trong `fetch` bằng:

```ts
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
```

**Không** tự đặt `Content-Type: multipart/form-data`: header đó phải kèm "boundary" (chuỗi ngăn cách các phần), chỉ trình duyệt mới biết. Tự đặt là server không đọc được file.

## Bước 2: Kiểu dữ liệu admin

Trong `web/src/lib/types.ts`, thêm khối sau ngay trước `// Body of POST /orders` (kiểu `CreateOrderInput`):

```ts
// ---------- Admin ----------

// A variant as the admin sees it: hidden ones (isActive = false) included
export type AdminVariant = ProductVariant & { isActive: boolean }

// GET /admin/products/:id (images only on the detail, not in the list)
export type AdminProduct = {
  id: number
  categoryId: number
  brandId: number
  category: Category
  brand: Brand
  name: string
  slug: string
  shortDescription: string | null
  description: string | null
  specs: Record<string, string> | null
  thumbnailUrl: string | null
  isFeatured: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
  variants: AdminVariant[]
  images?: ProductImage[]
}

// Body of POST /admin/products/:id/variants and one element of variants[] when creating
export type VariantInput = {
  sku: string
  name: string
  color?: string
  storage?: string
  price: number
  salePrice?: number | null
  stock: number
  isActive?: boolean
}

// Product fields (no variants): body of PATCH /admin/products/:id
export type ProductInput = {
  categoryId: number
  brandId: number
  name: string
  slug: string
  shortDescription?: string
  description?: string
  specs?: Record<string, string>
  isFeatured: boolean
  isActive: boolean
}
```

`AdminVariant = ProductVariant & { isActive: boolean }`: dấu `&` ghép hai kiểu. Trang cửa hàng không cần `isActive` (API đã lọc phiên bản ẩn), trang admin thì cần.

## Bước 3: Chặn khách và trang 403

Tạo `web/src/pages/ForbiddenPage.tsx`:

```tsx
import { Link } from 'react-router'

// Logged in, but not allowed (e.g. a customer opening /admin)
export default function ForbiddenPage() {
  return (
    <section className="py-16 text-center">
      <p className="text-6xl font-extrabold text-amber-400">403</p>
      <h1 className="mt-4 text-xl font-bold">Bạn không có quyền vào trang này</h1>
      <p className="mt-2 text-slate-500">Trang quản trị chỉ dành cho tài khoản quản trị viên.</p>
      <Link to="/" className="mt-6 inline-block text-amber-700 underline">
        Về trang chủ
      </Link>
    </section>
  )
}
```

Tạo `web/src/auth/RequireAdmin.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import ForbiddenPage from '../pages/ForbiddenPage.tsx'
import { useAuth } from './auth-context.ts'

// Like RequireAuth, plus: the user must be an admin. A customer sees the 403 page.
// The real protection is still on the API (@Roles('admin') -> 403): this only avoids
// showing pages full of errors.
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <p className="py-16 text-center text-slate-500">Đang tải...</p>
  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/dang-nhap?redirect=${redirect}`} replace />
  }
  if (user.role !== 'admin') return <ForbiddenPage />
  return children
}
```

Giống `RequireAuth` của Phần 10, thêm một bước: đăng nhập rồi mà `role` không phải `admin` thì hiện 403. **401** (chưa đăng nhập) chuyển sang trang đăng nhập; **403** (đăng nhập rồi nhưng không đủ quyền) thì đăng nhập lại cũng vô ích. Đúng như ý nghĩa hai mã này ở Phần 7.

## Bước 4: Layout admin

Tạo `web/src/admin/AdminLayout.tsx`:

```tsx
import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/auth-context.ts'

// Side menu of the admin area. NavLink adds the "active" style to the current page.
const NAV = [{ to: '/admin/san-pham', label: 'Sản phẩm' }]

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

- Mọi file của khu admin nằm trong thư mục `src/admin/`, tách khỏi trang cửa hàng.
- `NavLink` (không phải `Link`): `className` nhận một hàm `({ isActive }) => ...` để tô mục đang mở. Ở đây so đường dẫn là đủ (khác menu danh mục của Phần 9).
- `NAV` là mảng: hai task sau chỉ cần thêm một dòng.

## Bước 5: Các hook gọi API admin

Tạo `web/src/admin/admin-products.ts`:

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api.ts'
import type {
  AdminProduct,
  AdminVariant,
  Paginated,
  ProductImage,
  ProductInput,
  VariantInput,
} from '../lib/types.ts'

// Hooks for /api/v1/admin/products, /admin/variants, /admin/images (admin token needed).
// Every key starts with 'admin': logout removes them all (PRIVATE_QUERY_KEYS in AuthProvider).

export const ADMIN_PAGE_SIZE = 20

export type AdminProductFilters = { q?: string; categoryId?: number; page: number }

export function useAdminProducts(filters: AdminProductFilters) {
  return useQuery({
    queryKey: ['admin', 'products', filters],
    queryFn: () =>
      api<Paginated<AdminProduct>>('/admin/products', { params: { ...filters, limit: ADMIN_PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  })
}

export function useAdminProduct(id: number) {
  return useQuery({
    queryKey: ['admin', 'product', id],
    queryFn: () => api<AdminProduct>(`/admin/products/${id}`),
  })
}

// After any change: the admin lists AND the shop pages may show old data
function useRefreshProducts() {
  const queryClient = useQueryClient()
  return (id?: number) => {
    if (id !== undefined) queryClient.invalidateQueries({ queryKey: ['admin', 'product', id] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
    queryClient.invalidateQueries({ queryKey: ['products'] })
    queryClient.invalidateQueries({ queryKey: ['product'] })
  }
}

export function useCreateProduct() {
  const refresh = useRefreshProducts()
  return useMutation({
    mutationFn: (input: ProductInput & { variants: VariantInput[] }) =>
      api<AdminProduct>('/admin/products', { method: 'POST', body: input }),
    onSuccess: () => refresh(),
  })
}

export function useUpdateProduct(id: number) {
  const refresh = useRefreshProducts()
  return useMutation({
    mutationFn: (input: Partial<ProductInput> & { thumbnailUrl?: string }) =>
      api<AdminProduct>(`/admin/products/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => refresh(id),
  })
}

export function useDeleteProduct() {
  const refresh = useRefreshProducts()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/admin/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => refresh(),
  })
}

export function useAddVariant(productId: number) {
  const refresh = useRefreshProducts()
  return useMutation({
    mutationFn: (input: VariantInput) =>
      api<AdminVariant>(`/admin/products/${productId}/variants`, { method: 'POST', body: input }),
    onSuccess: () => refresh(productId),
  })
}

export function useUpdateVariant(productId: number) {
  const refresh = useRefreshProducts()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<VariantInput> & { id: number }) =>
      api<AdminVariant>(`/admin/variants/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => refresh(productId),
  })
}

export function useUploadImage(productId: number) {
  const refresh = useRefreshProducts()
  return useMutation({
    mutationFn: (file: File) => {
      // Same as <form enctype="multipart/form-data"> with <input type="file" name="file">
      const form = new FormData()
      form.append('file', file)
      return api<ProductImage>(`/admin/products/${productId}/images`, { method: 'POST', body: form })
    },
    onSuccess: () => refresh(productId),
  })
}

export function useDeleteImage(productId: number) {
  const refresh = useRefreshProducts()
  return useMutation({
    mutationFn: (imageId: number) => api<void>(`/admin/images/${imageId}`, { method: 'DELETE' }),
    onSuccess: () => refresh(productId),
  })
}
```

- Mọi `queryKey` bắt đầu bằng `'admin'`. Ở Bước 10 ta thêm `'admin'` vào `PRIVATE_QUERY_KEYS`: đăng xuất là xoá hết dữ liệu admin khỏi cache.
- `useRefreshProducts`: sau mỗi thay đổi, làm cũ cả cache **admin** lẫn cache **cửa hàng** (`products`, `product`). Sửa giá ở admin thì trang sản phẩm cũng hiện giá mới.
- `useUploadImage`: `new FormData()` + `form.append('file', file)`, đúng tên field `"file"` mà `FileInterceptor('file')` của server đọc.
- `useUpdateVariant` nhận `{ id, ...input }`: `id` để ghép URL, phần còn lại thành body.

## Bước 6: Form sản phẩm và phiên bản

Tạo `web/src/lib/slug.ts`:

```ts
// "Điện thoại Galaxy S25 Ultra!" -> "dien-thoai-galaxy-s25-ultra"
// Same rule as the API's slug check: lowercase letters, digits and single dashes.
export function slugify(text: string): string {
  return text
    .normalize('NFD') // "ệ" -> "e" + accent marks
    .replace(/[̀-ͯ]/g, '') // drop the accent marks
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // anything else becomes a dash
    .replace(/^-+|-+$/g, '') // no dash at the start or the end
}
```

`normalize('NFD')` tách chữ có dấu thành chữ gốc + dấu ("ệ" → "e" + 2 dấu), rồi xoá các dấu. Riêng "đ" không phải chữ "d" có dấu nên phải thay tay.

Tạo `web/src/admin/product-form.ts`:

```ts
import type { AdminProduct, ProductInput, VariantInput } from '../lib/types.ts'

// Tailwind classes shared by every admin input
export const ADMIN_INPUT =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500'

// What the inputs hold. HTML inputs always give strings ("18990000"),
// so the form keeps strings and converts to numbers only when sending.
export type ProductFormValue = {
  categoryId: string
  brandId: string
  name: string
  slug: string
  shortDescription: string
  description: string
  specsText: string // one "key: value" per line
  isFeatured: boolean
  isActive: boolean
}

export type VariantFormValue = {
  sku: string
  name: string
  color: string
  storage: string
  price: string
  salePrice: string
  stock: string
}

export const EMPTY_PRODUCT: ProductFormValue = {
  categoryId: '',
  brandId: '',
  name: '',
  slug: '',
  shortDescription: '',
  description: '',
  specsText: '',
  isFeatured: false,
  isActive: true,
}

export const EMPTY_VARIANT: VariantFormValue = {
  sku: '',
  name: '',
  color: '',
  storage: '',
  price: '',
  salePrice: '',
  stock: '0',
}

// { screen: "6.1 inch", chip: "A19" } <-> "screen: 6.1 inch\nchip: A19"
export function specsToText(specs: Record<string, string> | null): string {
  return Object.entries(specs ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
}

export function textToSpecs(text: string): Record<string, string> {
  const specs: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const colon = line.indexOf(':')
    if (colon > 0) specs[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  return specs
}

export function fromProduct(product: AdminProduct): ProductFormValue {
  return {
    categoryId: String(product.categoryId),
    brandId: String(product.brandId),
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription ?? '',
    description: product.description ?? '',
    specsText: specsToText(product.specs),
    isFeatured: product.isFeatured,
    isActive: product.isActive,
  }
}

export function toProductInput(value: ProductFormValue): ProductInput {
  return {
    categoryId: Number(value.categoryId),
    brandId: Number(value.brandId),
    name: value.name.trim(),
    slug: value.slug.trim(),
    // Empty optional text: send nothing rather than ""
    shortDescription: value.shortDescription.trim() || undefined,
    description: value.description.trim() || undefined,
    specs: textToSpecs(value.specsText),
    isFeatured: value.isFeatured,
    isActive: value.isActive,
  }
}

export function toVariantInput(value: VariantFormValue): VariantInput {
  return {
    sku: value.sku.trim().toUpperCase(),
    name: value.name.trim(),
    color: value.color.trim() || undefined,
    storage: value.storage.trim() || undefined,
    price: Number(value.price),
    salePrice: value.salePrice === '' ? null : Number(value.salePrice),
    stock: Number(value.stock),
  }
}
```

- `ProductFormValue` / `VariantFormValue`: dữ liệu **của form** (toàn chuỗi). `ProductInput` / `VariantInput` (Bước 2): dữ liệu **của API**. Các hàm `from...` / `to...` chuyển qua lại.
- Thông số kỹ thuật nhập bằng textarea, mỗi dòng `khoá: giá trị`. `textToSpecs` cắt ở dấu `:` **đầu tiên**, nên giá trị có dấu `:` vẫn đúng (`ports: USB-C: 2 cổng`). Khoá nên dùng đúng tên trang chi tiết có nhãn tiếng Việt (`screen`, `chip`, `ram`... ở `SPEC_LABELS` của Phần 9).
- Giá KM để trống → `null` (bỏ giá khuyến mãi), không phải `0`.

Tạo `web/src/admin/ProductFields.tsx`:

```tsx
import { useBrands, useCategories } from '../lib/queries.ts'
import { slugify } from '../lib/slug.ts'
import { ADMIN_INPUT, type ProductFormValue } from './product-form.ts'

type Props = {
  value: ProductFormValue
  onChange: (value: ProductFormValue) => void
  // Create page: typing the name also fills the slug (until the slug is edited by hand)
  autoSlug?: boolean
}

// The product inputs, shared by the create and the edit page.
// "Controlled from the parent": the parent owns the state, this component only shows it.
export default function ProductFields({ value, onChange, autoSlug = false }: Props) {
  const { data: categories = [] } = useCategories()
  const { data: brands = [] } = useBrands()
  const set = (changes: Partial<ProductFormValue>) => onChange({ ...value, ...changes })

  function changeName(name: string) {
    const followsName = autoSlug && value.slug === slugify(value.name)
    set(followsName ? { name, slug: slugify(name) } : { name })
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">
        Danh mục
        <select value={value.categoryId} onChange={(e) => set({ categoryId: e.target.value })} className={ADMIN_INPUT}>
          <option value="">-- Chọn danh mục --</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Hãng
        <select value={value.brandId} onChange={(e) => set({ brandId: e.target.value })} className={ADMIN_INPUT}>
          <option value="">-- Chọn hãng --</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Tên sản phẩm
        <input value={value.name} onChange={(e) => changeName(e.target.value)} className={ADMIN_INPUT} />
      </label>
      <label className="text-sm">
        Slug (đường dẫn)
        <input value={value.slug} onChange={(e) => set({ slug: e.target.value })} className={ADMIN_INPUT} />
      </label>
      <label className="text-sm sm:col-span-2">
        Mô tả ngắn
        <input
          value={value.shortDescription}
          onChange={(e) => set({ shortDescription: e.target.value })}
          className={ADMIN_INPUT}
        />
      </label>
      <label className="text-sm">
        Mô tả chi tiết
        <textarea
          value={value.description}
          onChange={(e) => set({ description: e.target.value })}
          rows={5}
          className={ADMIN_INPUT}
        />
      </label>
      <label className="text-sm">
        Thông số (mỗi dòng "khoá: giá trị", ví dụ <code>screen: 6.1 inch OLED</code>)
        <textarea
          value={value.specsText}
          onChange={(e) => set({ specsText: e.target.value })}
          rows={5}
          className={`${ADMIN_INPUT} font-mono`}
        />
      </label>
      <div className="flex gap-6 text-sm sm:col-span-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={value.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
          Đang bán (hiện trên cửa hàng)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={value.isFeatured} onChange={(e) => set({ isFeatured: e.target.checked })} />
          Nổi bật (trang chủ)
        </label>
      </div>
    </div>
  )
}
```

`autoSlug`: ở trang tạo, gõ tên thì slug tự đổi theo, **cho tới khi** admin tự sửa slug (lúc đó slug không còn bằng `slugify(tên cũ)` nữa).

Tạo `web/src/admin/VariantFields.tsx`:

```tsx
import { ADMIN_INPUT, type VariantFormValue } from './product-form.ts'

type Props = {
  value: VariantFormValue
  onChange: (value: VariantFormValue) => void
}

const FIELDS: { key: keyof VariantFormValue; label: string; type?: string; placeholder?: string }[] = [
  { key: 'sku', label: 'SKU', placeholder: 'GP10-128-BLK' },
  { key: 'name', label: 'Tên phiên bản', placeholder: '128GB - Đen' },
  { key: 'color', label: 'Màu', placeholder: 'Đen' },
  { key: 'storage', label: 'Dung lượng', placeholder: '128GB' },
  { key: 'price', label: 'Giá (đ)', type: 'number' },
  { key: 'salePrice', label: 'Giá KM (đ)', type: 'number' },
  { key: 'stock', label: 'Tồn kho', type: 'number' },
]

// The inputs of ONE variant, used for the variant rows of the create page
// and for the "Thêm phiên bản" form of the edit page
export default function VariantFields({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {FIELDS.map((field) => (
        <label key={field.key} className="text-xs text-slate-500">
          {field.label}
          <input
            type={field.type ?? 'text'}
            min={field.type === 'number' ? 0 : undefined}
            value={value[field.key]}
            placeholder={field.placeholder}
            onChange={(e) => onChange({ ...value, [field.key]: e.target.value })}
            className={ADMIN_INPUT}
          />
        </label>
      ))}
    </div>
  )
}
```

## Bước 7: Danh sách sản phẩm

Tạo `web/src/admin/AdminProductListPage.tsx`:

```tsx
import { type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import ErrorBox from '../components/ErrorBox.tsx'
import Pagination from '../components/Pagination.tsx'
import { formatPrice } from '../lib/format.ts'
import { useCategories } from '../lib/queries.ts'
import { ADMIN_PAGE_SIZE, useAdminProducts } from './admin-products.ts'
import { ADMIN_INPUT } from './product-form.ts'

// /admin/san-pham?q=&categoryId=&page=
export default function AdminProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const categoryId = Number(searchParams.get('categoryId')) || undefined
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useAdminProducts({
    q: q || undefined,
    categoryId,
    page,
  })
  const { data: categories = [] } = useCategories()

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

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Sản phẩm {data && <span className="text-slate-400">({data.total})</span>}</h1>
        <Link to="/admin/san-pham/moi" className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium hover:bg-amber-500">
          + Thêm sản phẩm
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        {/* key: when q changes from outside (Back button), React re-creates the input with the new default */}
        <form key={q} onSubmit={handleSearch} className="flex-1">
          <input name="q" defaultValue={q} placeholder="Tìm theo tên hoặc slug..." className={ADMIN_INPUT} />
        </form>
        <select
          aria-label="Lọc danh mục"
          value={categoryId ?? ''}
          onChange={(e) => update({ categoryId: e.target.value })}
          className={`${ADMIN_INPUT} sm:w-56`}
        >
          <option value="">Tất cả danh mục</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {isError && <ErrorBox error={error} onRetry={() => refetch()} />}
      {isPending && <div className="h-64 animate-pulse rounded-xl bg-slate-200" />}

      {data && (
        <div className={`overflow-x-auto rounded-xl bg-white shadow-sm ${isPlaceholderData ? 'opacity-50' : ''}`}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-3">Sản phẩm</th>
                <th className="p-3">Danh mục</th>
                <th className="p-3">Hãng</th>
                <th className="p-3 text-right">Giá từ</th>
                <th className="p-3 text-right">Tồn kho</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((product) => {
                const prices = product.variants.map((v) => v.salePrice ?? v.price)
                const stock = product.variants.reduce((sum, v) => sum + v.stock, 0)
                return (
                  <tr key={product.id} className="border-t border-slate-100">
                    <td className="p-3">
                      <Link to={`/admin/san-pham/${product.id}`} className="flex items-center gap-3 hover:underline">
                        <img src={product.thumbnailUrl ?? ''} alt="" className="h-10 w-10 rounded bg-slate-100 object-cover" />
                        <span>
                          {product.name}
                          {!product.isActive && (
                            <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">Đang ẩn</span>
                          )}
                          {product.isFeatured && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">Nổi bật</span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className="p-3">{product.category.name}</td>
                    <td className="p-3">{product.brand.name}</td>
                    <td className="p-3 text-right">{prices.length ? formatPrice(Math.min(...prices)) : '-'}</td>
                    <td className={`p-3 text-right ${stock === 0 ? 'font-semibold text-red-600' : ''}`}>{stock}</td>
                  </tr>
                )
              })}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500">
                    Không có sản phẩm phù hợp.
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
          totalPages={Math.ceil(data.total / ADMIN_PAGE_SIZE)}
          onChange={(next) => update({ page: String(next) })}
        />
      )}
    </section>
  )
}
```

- Bộ lọc nằm trên URL như trang danh sách ở Phần 9.
- Ô tìm kiếm là input **không kiểm soát** (`defaultValue`), đọc lúc submit bằng `new FormData(event.currentTarget)`. `key={q}` trên `<form>`: khi `q` trên URL đổi từ bên ngoài (nút Back), React tạo lại form với giá trị mặc định mới.
- Tổng tồn kho bằng 0 tô đỏ: admin nhìn là biết sản phẩm nào cần nhập hàng.

## Bước 8: Tạo sản phẩm

Tạo `web/src/admin/AdminProductCreatePage.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import FormErrors from '../components/FormErrors.tsx'
import { ApiError } from '../lib/api.ts'
import { useCreateProduct } from './admin-products.ts'
import ProductFields from './ProductFields.tsx'
import { EMPTY_PRODUCT, EMPTY_VARIANT, toProductInput, toVariantInput } from './product-form.ts'
import VariantFields from './VariantFields.tsx'

// /admin/san-pham/moi: the product and its first variants, sent in ONE request
export default function AdminProductCreatePage() {
  const navigate = useNavigate()
  const createProduct = useCreateProduct()
  const [product, setProduct] = useState(EMPTY_PRODUCT)
  const [variants, setVariants] = useState([EMPTY_VARIANT])
  const [errors, setErrors] = useState<string[]>([])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!product.categoryId || !product.brandId) {
      setErrors(['Chọn danh mục và hãng'])
      return
    }
    setErrors([])
    try {
      const created = await createProduct.mutateAsync({
        ...toProductInput(product),
        variants: variants.map(toVariantInput),
      })
      // Continue on the edit page: images can only be added once the product exists
      navigate(`/admin/san-pham/${created.id}`, { replace: true })
    } catch (error) {
      setErrors(error instanceof ApiError ? error.messages : ['Có lỗi xảy ra'])
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Thêm sản phẩm</h1>
        <Link to="/admin/san-pham" className="text-sm text-amber-700 hover:underline">
          ‹ Danh sách
        </Link>
      </div>
      <FormErrors messages={errors} />

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <ProductFields value={product} onChange={setProduct} autoSlug />
      </section>

      <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Phiên bản (ít nhất một)</h2>
        {variants.map((variant, index) => (
          <div key={index} className="flex items-end gap-2 border-b border-slate-100 pb-3">
            <div className="flex-1">
              <VariantFields
                value={variant}
                onChange={(changed) => setVariants(variants.map((v, i) => (i === index ? changed : v)))}
              />
            </div>
            <button
              type="button"
              disabled={variants.length === 1}
              onClick={() => setVariants(variants.filter((_, i) => i !== index))}
              className="mb-1 text-sm text-red-600 disabled:opacity-30"
            >
              Xoá
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setVariants([...variants, EMPTY_VARIANT])} className="text-sm text-amber-700 underline">
          + Thêm phiên bản
        </button>
      </section>

      <button
        type="submit"
        disabled={createProduct.isPending}
        className="rounded-lg bg-amber-400 px-6 py-2 font-semibold hover:bg-amber-500 disabled:opacity-50"
      >
        {createProduct.isPending ? 'Đang lưu...' : 'Tạo sản phẩm'}
      </button>
    </form>
  )
}
```

- Mảng `variants` trong state: thêm dòng `[...variants, EMPTY_VARIANT]`, sửa dòng `variants.map((v, i) => i === index ? changed : v)`, xoá dòng `variants.filter(...)`. Không bao giờ sửa mảng tại chỗ.
- `key={index}` chấp nhận được ở đây vì các dòng không có id riêng; xoá dòng giữa thì React dùng lại ô nhập theo vị trí. Có id thì luôn dùng id.
- Kiểm tra "chọn danh mục và hãng" ngay ở form: không chọn thì `Number('')` thành `0` và API sẽ báo lỗi khoá ngoại khó hiểu.
- Tạo xong chuyển sang trang sửa: ảnh chỉ tải lên được khi sản phẩm đã có `id`.

## Bước 9: Trang sửa sản phẩm

Tạo `web/src/admin/VariantRow.tsx`:

```tsx
import { useState } from 'react'
import { ApiError } from '../lib/api.ts'
import type { AdminVariant } from '../lib/types.ts'
import { useUpdateVariant } from './admin-products.ts'

const CELL_INPUT = 'w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm'

type Props = { productId: number; variant: AdminVariant }

// One editable row: price, sale price, stock, on/off. "Lưu" sends only what changed.
export default function VariantRow({ productId, variant }: Props) {
  const updateVariant = useUpdateVariant(productId)
  const [price, setPrice] = useState(String(variant.price))
  const [salePrice, setSalePrice] = useState(variant.salePrice === null ? '' : String(variant.salePrice))
  const [stock, setStock] = useState(String(variant.stock))
  const [isActive, setIsActive] = useState(variant.isActive)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // Typing again hides the result of the previous save
  const edit = (setter: (value: string) => void) => (event: { target: { value: string } }) => {
    setter(event.target.value)
    setMessage(null)
  }

  // Compare with what the server has, field by field
  const changes: Record<string, number | boolean | null> = {}
  if (Number(price) !== variant.price) changes.price = Number(price)
  const newSale = salePrice === '' ? null : Number(salePrice)
  if (newSale !== variant.salePrice) changes.salePrice = newSale
  if (Number(stock) !== variant.stock) changes.stock = Number(stock)
  if (isActive !== variant.isActive) changes.isActive = isActive
  const dirty = Object.keys(changes).length > 0

  async function save() {
    setMessage(null)
    try {
      await updateVariant.mutateAsync({ id: variant.id, ...changes })
      setMessage({ ok: true, text: 'Đã lưu' })
    } catch (error) {
      setMessage({ ok: false, text: error instanceof ApiError ? error.message : 'Có lỗi xảy ra' })
    }
  }

  return (
    <tr className={`border-t border-slate-100 ${isActive ? '' : 'bg-slate-50 text-slate-400'}`}>
      <td className="p-2 font-mono text-xs">{variant.sku}</td>
      <td className="p-2">{variant.name}</td>
      <td className="p-2">
        <input
          type="number"
          min={0}
          aria-label={`Giá ${variant.sku}`}
          value={price}
          onChange={edit(setPrice)}
          className={CELL_INPUT}
        />
      </td>
      <td className="p-2">
        <input
          type="number"
          min={0}
          aria-label={`Giá KM ${variant.sku}`}
          value={salePrice}
          placeholder="Không"
          onChange={edit(setSalePrice)}
          className={CELL_INPUT}
        />
      </td>
      <td className="p-2">
        <input
          type="number"
          min={0}
          aria-label={`Tồn kho ${variant.sku}`}
          value={stock}
          onChange={edit(setStock)}
          className={`${CELL_INPUT} w-20`}
        />
      </td>
      <td className="p-2 text-center">
        <input
          type="checkbox"
          aria-label={`Đang bán ${variant.sku}`}
          checked={isActive}
          onChange={(e) => {
            setIsActive(e.target.checked)
            setMessage(null)
          }}
        />
      </td>
      <td className="p-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || updateVariant.isPending}
          className="rounded bg-amber-400 px-3 py-1 text-sm font-medium text-slate-900 disabled:opacity-30"
        >
          Lưu
        </button>
        {message && (
          <p role={message.ok ? 'status' : 'alert'} className={`mt-1 text-xs ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
      </td>
    </tr>
  )
}
```

- Mỗi dòng có state riêng. `changes` so từng ô với giá trị **trên server** (`variant`), nút "Lưu" chỉ bật khi có thay đổi, và chỉ gửi các field đã đổi (`PATCH` một phần).
- Lỗi của dòng (ví dụ "Giá khuyến mãi không được lớn hơn giá gốc") hiện ngay dưới nút của dòng đó; gõ lại thì lỗi cũ biến mất.
- Lưu xong, cache làm mới và `variant` nhận giá trị mới, đúng bằng giá trị đang có trong ô, nên dòng tự hết "thay đổi".

Tạo `web/src/admin/ProductImages.tsx`:

```tsx
import { useState, type ChangeEvent } from 'react'
import { ApiError } from '../lib/api.ts'
import type { AdminProduct } from '../lib/types.ts'
import { useDeleteImage, useUpdateProduct, useUploadImage } from './admin-products.ts'

// Upload, delete and pick the thumbnail (the picture shown on product cards)
export default function ProductImages({ product }: { product: AdminProduct }) {
  const upload = useUploadImage(product.id)
  const deleteImage = useDeleteImage(product.id)
  const updateProduct = useUpdateProduct(product.id)
  const [error, setError] = useState('')

  // Turn any failed request into a message under the title
  async function run(action: () => Promise<unknown>) {
    setError('')
    try {
      await action()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Có lỗi xảy ra')
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // so choosing the same file again still triggers onChange
    if (file) run(() => upload.mutateAsync(file))
  }

  const images = product.images ?? []

  return (
    <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Ảnh sản phẩm ({images.length})</h2>
        <label className="cursor-pointer rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium hover:bg-amber-500">
          {upload.isPending ? 'Đang tải lên...' : '+ Tải ảnh lên'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
            disabled={upload.isPending}
            className="hidden"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">JPG, PNG hoặc WebP, tối đa 2MB.</p>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images.map((image) => {
          const isThumbnail = image.url === product.thumbnailUrl
          return (
            <li key={image.id} className="space-y-1 text-xs">
              <img
                src={image.url}
                alt=""
                className={`aspect-square w-full rounded-lg bg-slate-100 object-cover ${isThumbnail ? 'ring-2 ring-amber-500' : ''}`}
              />
              {isThumbnail ? (
                <p className="font-medium text-amber-700">Ảnh đại diện</p>
              ) : (
                <button
                  type="button"
                  onClick={() => run(() => updateProduct.mutateAsync({ thumbnailUrl: image.url }))}
                  className="text-amber-700 underline"
                >
                  Đặt làm ảnh đại diện
                </button>
              )}
              <button
                type="button"
                onClick={() => window.confirm('Xoá ảnh này?') && run(() => deleteImage.mutateAsync(image.id))}
                className="ml-3 text-red-600 underline"
              >
                Xoá
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- `<input type="file" className="hidden">` nằm trong `<label>`: bấm vào chữ "+ Tải ảnh lên" là mở hộp chọn file.
- `event.target.value = ''`: xoá lựa chọn, để chọn lại đúng file đó lần nữa vẫn kích hoạt `onChange`.
- `accept="image/jpeg,image/png,image/webp"` chỉ lọc hộp chọn file cho tiện. Server mới là nơi kiểm tra thật (đọc nội dung file, không tin tên/đuôi file).
- "Đặt làm ảnh đại diện" gửi `PATCH /admin/products/:id` với `{ thumbnailUrl: image.url }`.

Tạo `web/src/admin/AdminProductEditPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import ErrorBox from '../components/ErrorBox.tsx'
import FormErrors from '../components/FormErrors.tsx'
import { ApiError } from '../lib/api.ts'
import type { AdminProduct } from '../lib/types.ts'
import NotFoundPage from '../pages/NotFoundPage.tsx'
import { useAddVariant, useAdminProduct, useDeleteProduct, useUpdateProduct } from './admin-products.ts'
import ProductFields from './ProductFields.tsx'
import ProductImages from './ProductImages.tsx'
import { EMPTY_VARIANT, fromProduct, toProductInput, toVariantInput } from './product-form.ts'
import VariantFields from './VariantFields.tsx'
import VariantRow from './VariantRow.tsx'

// /admin/san-pham/:id
export default function AdminProductEditPage() {
  const id = Number(useParams().id)
  const { data: product, isPending, isError, error, refetch } = useAdminProduct(id)

  if (isPending) return <div className="h-96 animate-pulse rounded-xl bg-slate-200" />
  if (isError) {
    if (error instanceof ApiError && error.status === 404) return <NotFoundPage />
    return <ErrorBox error={error} onRetry={() => refetch()} />
  }
  // key: a fresh editor (fresh form state) for each product
  return <ProductEditor key={product.id} product={product} />
}

function ProductEditor({ product }: { product: AdminProduct }) {
  const navigate = useNavigate()
  const updateProduct = useUpdateProduct(product.id)
  const addVariant = useAddVariant(product.id)
  const deleteProduct = useDeleteProduct()

  // The form starts from the saved product; later refetches do not overwrite what is being typed
  const [form, setForm] = useState(() => fromProduct(product))
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [newVariant, setNewVariant] = useState(EMPTY_VARIANT)
  const [variantErrors, setVariantErrors] = useState<string[]>([])
  const [deleteError, setDeleteError] = useState('')

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormErrors([])
    setSaved(false)
    try {
      await updateProduct.mutateAsync(toProductInput(form))
      setSaved(true)
    } catch (error) {
      setFormErrors(error instanceof ApiError ? error.messages : ['Có lỗi xảy ra'])
    }
  }

  async function saveNewVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setVariantErrors([])
    try {
      await addVariant.mutateAsync(toVariantInput(newVariant))
      setNewVariant(EMPTY_VARIANT)
    } catch (error) {
      setVariantErrors(error instanceof ApiError ? error.messages : ['Có lỗi xảy ra'])
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Xoá hẳn "${product.name}"? Sản phẩm đã có người mua thì không xoá được, hãy ẩn nó.`)) return
    setDeleteError('')
    try {
      await deleteProduct.mutateAsync(product.id)
      navigate('/admin/san-pham', { replace: true })
    } catch (error) {
      setDeleteError(error instanceof ApiError ? error.message : 'Có lỗi xảy ra')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{product.name}</h1>
        <div className="flex gap-4 text-sm">
          {product.isActive && (
            <Link to={`/san-pham/${product.slug}`} className="text-amber-700 hover:underline">
              Xem trên cửa hàng ↗
            </Link>
          )}
          <Link to="/admin/san-pham" className="text-amber-700 hover:underline">
            ‹ Danh sách
          </Link>
        </div>
      </div>

      <form onSubmit={saveProduct} noValidate className="space-y-4 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Thông tin sản phẩm</h2>
        <FormErrors messages={formErrors} />
        <ProductFields value={form} onChange={setForm} />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={updateProduct.isPending}
            className="rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold hover:bg-amber-500 disabled:opacity-50"
          >
            Lưu thông tin
          </button>
          {saved && (
            <span role="status" className="text-sm text-emerald-700">
              Đã lưu
            </span>
          )}
        </div>
      </form>

      <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Phiên bản</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="p-2">SKU</th>
                <th className="p-2">Tên</th>
                <th className="p-2">Giá</th>
                <th className="p-2">Giá KM</th>
                <th className="p-2">Tồn kho</th>
                <th className="p-2">Đang bán</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {product.variants.map((variant) => (
                <VariantRow key={variant.id} productId={product.id} variant={variant} />
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={saveNewVariant} noValidate className="space-y-2 border-t border-slate-200 pt-3">
          <h3 className="text-sm font-medium">Thêm phiên bản</h3>
          <FormErrors messages={variantErrors} />
          <VariantFields value={newVariant} onChange={setNewVariant} />
          <button
            type="submit"
            disabled={addVariant.isPending}
            className="rounded-lg border border-amber-500 px-4 py-1.5 text-sm font-medium text-amber-800 disabled:opacity-50"
          >
            Thêm phiên bản
          </button>
        </form>
      </section>

      <ProductImages product={product} />

      <section className="rounded-xl border border-red-200 bg-white p-4">
        <h2 className="font-semibold text-red-700">Xoá sản phẩm</h2>
        <p className="mt-1 text-sm text-slate-500">
          Chỉ xoá được sản phẩm chưa ai đặt mua. Muốn ngừng bán, bỏ chọn "Đang bán" ở trên.
        </p>
        {deleteError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {deleteError}
          </p>
        )}
        <button
          type="button"
          onClick={handleDelete}
          className="mt-3 rounded-lg border border-red-300 px-4 py-1.5 text-sm text-red-600 hover:bg-red-50"
        >
          Xoá sản phẩm
        </button>
      </section>
    </div>
  )
}
```

- `useState(() => fromProduct(product))`: form bắt đầu từ dữ liệu đã lưu. Sau đó cache có làm mới (do sửa phiên bản, tải ảnh...) thì chữ admin **đang gõ** cũng không bị ghi đè.
- Xoá sản phẩm: sản phẩm đã có người mua thì API trả **409** "Không thể xoá vì dữ liệu đang được sử dụng" (khoá ngoại `OrderItems`, Phần 4 và 6). Hướng dẫn admin bỏ chọn "Đang bán" thay vì xoá.

## Bước 10: Nối vào app

Thay toàn bộ `web/src/App.tsx`: khu `/admin` đặt **ngoài** `<Route element={<Layout />}>` của cửa hàng, nên không có header/footer cửa hàng.

```tsx
import { Navigate, Route, Routes } from 'react-router'
import AdminLayout from './admin/AdminLayout.tsx'
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
      </Route>
    </Routes>
  )
}
```

Thay toàn bộ `web/src/components/Header.tsx` (link "Quản trị" chỉ hiện với admin):

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
              {user.role === 'admin' && (
                <Link to="/admin" className="hover:underline">
                  Quản trị
                </Link>
              )}
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

Trong `web/src/auth/AuthProvider.tsx`, thêm `'admin'`:

```ts
const PRIVATE_QUERY_KEYS = ['me', 'orders', 'order', 'admin']
```

`web/vite.config.ts` phải có dòng `'/uploads'` (task "Upload ảnh sản phẩm" đã thêm; chưa có thì thêm), nếu không ảnh vừa tải lên hiện ô trống ở `:5173`:

```ts
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Forward every request starting with /api to the NestJS server on port 3000.
    // The browser then sees the web app and the API as the same origin:
    // no CORS setup is needed and auth cookies just work.
    // In Docker, nginx does the same job (see web/nginx.conf).
    proxy: {
      '/api': 'http://localhost:3000',
      // Product images uploaded through the admin pages are served by the API too
      '/uploads': 'http://localhost:3000',
    },
  },
})
```

## Bước 11: Chạy thử

Cần một tài khoản admin (`npm run db:promote-admin`, Phần 7; đăng nhập lại sau khi nâng quyền).

1. Bằng tài khoản khách mở `/admin/san-pham`: trang 403. Đăng xuất rồi mở `/admin`: sang `/dang-nhap?redirect=%2Fadmin`.
2. Đăng nhập admin, bấm "Quản trị" trên header: 25 sản phẩm, trang 1 có 20. Tìm "galaxy": 4. Lọc Laptop: 9.
3. "+ Thêm sản phẩm": chọn Điện thoại, Samsung, gõ tên "Điện thoại Thử Nghiệm Đặc Biệt": slug thành `dien-thoai-thu-nghiem-dac-biet`. Thông số `screen: 6.1 inch` và `ram: 8GB` (hai dòng). Phiên bản `TEST-128-BLK`, "128GB - Đen", giá 10000000, giá KM 12000000 → "Giá khuyến mãi không được lớn hơn giá gốc". Sửa giá KM 9500000, thêm phiên bản thứ hai với SKU `IP17PM-256-ORG` → `SKU "IP17PM-256-ORG" đã được dùng` (409). Đổi SKU → tạo thành công, sang trang sửa.
4. Trong bảng phiên bản: đổi giá rồi "Lưu" → "Đã lưu"; bỏ chọn "Đang bán" của một dòng rồi "Lưu" → dòng xám. Kiểm tra bảng `ProductVariants` trong VS Code.
5. "Thêm phiên bản" với SKU mới: dòng mới xuất hiện trong bảng.
6. Tải lên một ảnh PNG/JPG: ảnh hiện và thành "Ảnh đại diện" (sản phẩm chưa có ảnh đại diện). Thử đổi đuôi một file `.txt` thành `.png` rồi tải lên → "Chỉ nhận ảnh JPG, PNG hoặc WebP". File lớn hơn 2MB → "Ảnh tối đa 2MB".
7. Mở `/admin/san-pham/1` (iPhone 17 Pro Max, ảnh mẫu `placehold.co`), bấm "Đặt làm ảnh đại diện" ở ảnh thứ hai: thẻ sản phẩm ngoài trang chủ đổi ảnh.
8. Ở sản phẩm vừa tạo, bỏ chọn "Đang bán (hiện trên cửa hàng)", "Lưu thông tin": danh sách admin có nhãn "Đang ẩn", còn `/san-pham/dien-thoai-thu-nghiem-dac-biet` ra 404.
9. "Xoá sản phẩm" ở iPhone 17 Pro Max: "Không thể xoá vì dữ liệu đang được sử dụng". Ở sản phẩm vừa tạo: xoá được, quay về danh sách.

10. Ở một sản phẩm có ảnh **vừa tải lên** (đường dẫn `/uploads/products/...`), bấm "Đặt làm ảnh đại diện" ở ảnh đó: thẻ sản phẩm đổi sang ảnh của bạn. Nếu nhận 400 "thumbnailUrl không hợp lệ" thì `CreateProductDto` phía server còn dùng `@IsUrl` (chỉ nhận URL đầy đủ `https://...`): sửa `thumbnailUrl` theo bản mới của task "API admin: quản lý sản phẩm và phiên bản" (dùng `@Matches` nhận cả `https://...` lẫn `/uploads/...`).

## Kiểm tra

- [ ] `npm run lint` và `npm run build` trong `web/` đều qua
- [ ] Khách → 403, chưa đăng nhập → trang đăng nhập; admin vào được, có link "Quản trị"
- [ ] Tạo sản phẩm có nhiều phiên bản; sửa thông tin, ẩn/hiện; sửa giá, tồn kho, bật/tắt từng phiên bản; thêm phiên bản
- [ ] Tải ảnh lên, ảnh xem được qua `:5173`; file sai loại/quá lớn báo đúng lỗi; xoá ảnh; đổi ảnh đại diện
- [ ] Mọi lỗi 400/409 hiện đúng câu của API; trang cửa hàng cập nhật theo thay đổi ở admin
- [ ] Giải thích được: vì sao `RequireAdmin` không thay được `@Roles('admin')`; vì sao form giữ chuỗi; vì sao không tự đặt `Content-Type` khi gửi `FormData`
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Thêm nút "Xoá" cho từng phiên bản (`DELETE /admin/variants/:id`, đã có ở server). Phiên bản đã có người mua → 409, hiện thông báo trong dòng đó.
2. Cho phép kéo thả file ảnh vào khung ảnh: xử lý `onDragOver` (gọi `event.preventDefault()`) và `onDrop` (lấy `event.dataTransfer.files[0]`).
