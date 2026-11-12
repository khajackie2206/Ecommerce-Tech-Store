## Mục tiêu

Trang `/san-pham/:slug` thật, dùng `GET /api/v1/products/:slug` của Phần 6:

- Đường dẫn "Trang chủ / Điện thoại / iPhone 17 Pro Max".
- Bộ ảnh: ảnh lớn + ảnh nhỏ, bấm ảnh nhỏ để đổi.
- Chọn **phiên bản** (dung lượng) và **màu** → đổi giá, giá gốc, tồn kho theo đúng biến thể (variant).
- Ô số lượng giới hạn trong tồn kho; nút "Thêm vào giỏ" (task "Giỏ hàng" ở Phần 10 nối vào giỏ, ở task này để tạm `disabled`).
- Bảng thông số kỹ thuật (cột `specs` JSON) với nhãn tiếng Việt.
- Slug không tồn tại → trang 404.

**Làm sau:** task "API client chung và TanStack Query" (cần `useProduct`) và có `ErrorBox` (task "Trang chủ"). Song song được với task "Trang danh sách sản phẩm".

**Đọc trước:** https://react.dev/learn/choosing-the-state-structure (mục "Avoid redundant state") và https://react.dev/learn/preserving-and-resetting-state (mục "Resetting state with a key").

## Biến thể (variant) chọn thế nào?

API trả các biến thể đã sắp theo giá tăng dần (Phần 6), ví dụ iPhone 17 Pro Max:

| Phiên bản | Màu | Giá bán | Tồn |
|---|---|---|---|
| 256GB | Cam vũ trụ | 36.990.000 | 25 |
| 256GB | Xanh đậm | 36.990.000 | 18 |
| 512GB | Bạc | 44.490.000 | 10 |
| 1TB | Cam vũ trụ | 50.990.000 | 4 |

Không phải tổ hợp nào cũng có (không có "512GB Cam vũ trụ"). Quy tắc của trang:
- Mặc định chọn biến thể **rẻ nhất còn hàng**.
- Bấm một dung lượng/màu: giữ lựa chọn kia nếu tổ hợp tồn tại; không thì lấy biến thể đầu tiên (rẻ nhất) có giá trị vừa bấm. Đang "512GB Bạc" bấm "Cam vũ trụ" → không có 512GB Cam → chuyển sang "256GB Cam vũ trụ".
- State chỉ lưu **id của biến thể đang chọn**. Màu, dung lượng, giá đang chọn đều **tính ra** từ biến thể đó, không lưu thêm state nào (lưu nhiều state cho cùng một thông tin là nguồn lỗi "chọn màu này mà giá của màu kia").

## Bước 1: Trang chi tiết

Thay toàn bộ `web/src/pages/ProductDetailPage.tsx`:

```tsx
import { useState } from 'react'
import { Link, useParams } from 'react-router'
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
    }
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
            {/* Wired to the cart in Part 10 */}
            <button
              type="button"
              disabled
              title="Giỏ hàng có ở Phần 10"
              className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white disabled:opacity-50"
            >
              Thêm vào giỏ
            </button>
          </div>
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

Giải thích:
- Trang chia hai component. `ProductDetailPage` lo tải dữ liệu (đang tải / lỗi / 404). `ProductView` chỉ chạy khi đã có `product`, nên bên trong không phải kiểm tra `undefined` ở mọi dòng.
- `error instanceof ApiError && error.status === 404` → dùng lại `NotFoundPage`. Lỗi khác (API tắt...) → `ErrorBox` có nút "Thử lại".
- `key={product.id}` trên `ProductView`: đi từ sản phẩm A sang sản phẩm B (cùng route, chỉ khác slug), React thấy `key` khác nên **tạo mới** `ProductView`, mọi state (biến thể, ảnh, số lượng) về lại ban đầu. Không có `key`, trang B có thể giữ `selectedId` của sản phẩm A.
- `useState(() => ...)`: truyền **hàm** để tính giá trị ban đầu chỉ một lần, không tính lại ở mỗi lần vẽ.
- `unique()` lấy danh sách màu/dung lượng không trùng, bỏ `null`. Phụ kiện (sạc, tai nghe) chỉ có màu, `storage` là `null`, nên hàng "Phiên bản" tự ẩn.
- `choose({ color })` / `choose({ storage })` làm đúng quy tắc ở phần trên, và đặt lại số lượng về 1.
- `effectivePrice`: giá khách trả = `salePrice` nếu có, không thì `price`. Cùng quy tắc với `COALESCE(salePrice, price)` bên API.
- `SPEC_LABELS[key] ?? key`: khoá nào chưa có nhãn tiếng Việt thì hiện nguyên tên khoá, không mất dòng.
- Nút "Thêm vào giỏ" để `disabled`. Phần 10 thay bằng code thêm vào giỏ thật.

## Bước 2: Chạy thử

Mở http://localhost:5173/san-pham/iphone-17-pro-max:
1. Mặc định "256GB" + "Cam vũ trụ", giá **36.990.000 ₫**, giá gốc 37.990.000 ₫ gạch ngang, "Còn 25 sản phẩm".
2. Bấm **512GB**: giá 44.490.000 ₫, màu tự chuyển sang **Bạc**, không còn giá gạch ngang (biến thể này không giảm giá).
3. Bấm **Cam vũ trụ**: không có 512GB Cam nên về **256GB**.
4. Bấm ảnh nhỏ thứ 2: ảnh lớn đổi.
5. Bấm `+` hai lần (số lượng 3), rồi đổi màu: số lượng về 1. Chọn **1TB** và bấm `+` liên tục: dừng ở 4 (tồn kho).
6. Bảng thông số: "Màn hình 6.9 inch OLED 120Hz", "Chip Apple A19 Pro"...
7. Mở `/san-pham/pin-du-phong-xiaomi-10000mah`: chỉ có hàng "Màu sắc".
8. Mở `/san-pham/khong-co-san-pham`: trang 404.

## Kiểm tra

- [ ] `npm run lint` và `npm run build` trong `web/` đều qua
- [ ] Đổi dung lượng/màu thì giá, giá gốc, tồn kho đổi theo; tổ hợp không tồn tại được xử lý như Bước 2
- [ ] Số lượng không vượt tồn kho; slug lạ ra trang 404
- [ ] Giải thích được: vì sao chỉ lưu `selectedId` mà không lưu thêm `selectedColor`, `price`; `key={product.id}` để làm gì
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Đổi tiêu đề tab trình duyệt thành tên sản phẩm. Với React 19 chỉ cần đặt `<title>{product.name} | TechStore</title>` bên trong JSX của `ProductView`: React tự đưa nó lên `<head>`.
2. Làm mờ (nhưng vẫn bấm được) các nút màu không có ở dung lượng đang chọn, để khách biết bấm vào sẽ đổi cả dung lượng. Gợi ý: `variants.some((v) => v.color === color && v.storage === selected?.storage)`.
