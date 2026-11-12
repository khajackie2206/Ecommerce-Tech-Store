## Mục tiêu

Trang chủ thật: một banner, khối **Sản phẩm nổi bật**, và một khối cho **mỗi danh mục** (4 sản phẩm mới nhất + link "Xem tất cả N sản phẩm"). Kèm 3 component dùng lại ở các trang sau:

| Component | Việc của nó |
|---|---|
| `ProductCard` | Thẻ một sản phẩm: ảnh, hãng, tên, giá bán, giá gốc gạch ngang, nhãn `-7%`, nhãn "Hết hàng" |
| `ProductGrid` | Lưới thẻ; lúc đang tải hiện các khối xám (skeleton); không có gì thì báo "Chưa có sản phẩm phù hợp." |
| `ErrorBox` | Hộp báo lỗi (nội dung lấy từ `error.message`) và nút "Thử lại" |

Dữ liệu: `GET /api/v1/products?featured=true&limit=8` và `GET /api/v1/products?category=<slug>&limit=4`.

**Làm sau:** task "API client chung và TanStack Query". Task "Trang danh sách sản phẩm" dùng lại `ProductGrid` của task này nên làm sau; task "Trang chi tiết" dùng `ErrorBox`, có thể làm song song nếu chép trước `ErrorBox.tsx`.

**Đọc trước:** https://react.dev/learn/passing-props-to-a-component, https://react.dev/learn/rendering-lists, https://react.dev/learn/conditional-rendering.

## Ba ý React mới trong task này

- **Props**: tham số truyền vào component, viết như thuộc tính HTML: `<ProductCard product={item} />`. Bên trong nhận bằng `function ProductCard({ product }: Props)`. Giống truyền biến vào một partial/template con.
- **Render danh sách**: dùng `array.map(...)` trả về JSX. Mỗi phần tử cần `key` duy nhất (ở đây là `product.id`) để React biết phần tử nào thêm, xoá, đổi chỗ.
- **Render có điều kiện**: `{onSale && <p>...</p>}` (chỉ hiện khi đúng), hoặc `cond ? <A /> : <B />`.

## Bước 1: Thẻ sản phẩm

Tạo `web/src/components/ProductCard.tsx`:

```tsx
import { Link } from 'react-router'
import { formatPrice } from '../lib/format.ts'
import type { ProductListItem } from '../lib/types.ts'

type Props = { product: ProductListItem }

export default function ProductCard({ product }: Props) {
  const onSale = product.listPrice > product.fromPrice
  // Rounded discount, e.g. 5% for 37.990.000 -> 35.990.000
  const discount = onSale
    ? Math.round((1 - product.fromPrice / product.listPrice) * 100)
    : 0

  return (
    <Link
      to={`/san-pham/${product.slug}`}
      className="group flex flex-col rounded-xl bg-white p-3 shadow-sm transition hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
        {product.thumbnailUrl && (
          <img
            src={product.thumbnailUrl}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        )}
        {discount > 0 && (
          <span className="absolute left-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
            -{discount}%
          </span>
        )}
        {!product.inStock && (
          <span className="absolute inset-x-0 bottom-0 bg-slate-800/80 py-1 text-center text-xs font-medium text-white">
            Hết hàng
          </span>
        )}
      </div>

      <p className="mt-3 text-xs uppercase tracking-wide text-slate-400">{product.brand.name}</p>
      <h3 className="mt-1 line-clamp-2 text-sm font-medium text-slate-800">{product.name}</h3>

      <div className="mt-auto pt-2">
        <p className="font-bold text-red-600">{formatPrice(product.fromPrice)}</p>
        {onSale && (
          <p className="text-xs text-slate-400 line-through">{formatPrice(product.listPrice)}</p>
        )}
      </div>
    </Link>
  )
}
```

- Cả thẻ là một `<Link>` tới trang chi tiết, bấm chỗ nào cũng mở sản phẩm.
- `fromPrice` (giá bán thấp nhất, đã tính giảm giá) và `listPrice` (giá gốc thấp nhất) do API tính sẵn ở Phần 6. Giá gốc lớn hơn giá bán thì hiện gạch ngang và % giảm.
- `loading="lazy"`: ảnh ở xa phía dưới chỉ tải khi người dùng cuộn tới, trang mở nhanh hơn.
- `line-clamp-2`: tên dài quá 2 dòng thì cắt bằng dấu `…`, các thẻ cao bằng nhau.

## Bước 2: Lưới sản phẩm và hộp lỗi

Tạo `web/src/components/ProductGrid.tsx`:

```tsx
import type { ProductListItem } from '../lib/types.ts'
import ProductCard from './ProductCard.tsx'

type Props = {
  products: ProductListItem[] | undefined
  isPending: boolean
  // How many grey placeholder cards to show while loading
  skeletonCount?: number
}

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'

export default function ProductGrid({ products, isPending, skeletonCount = 4 }: Props) {
  if (isPending) {
    return (
      <div className={GRID} aria-busy="true">
        {Array.from({ length: skeletonCount }, (_, index) => (
          <div key={index} className="h-72 animate-pulse rounded-xl bg-slate-200" />
        ))}
      </div>
    )
  }

  if (!products || products.length === 0) {
    return <p className="rounded-xl bg-white p-6 text-center text-slate-500">Chưa có sản phẩm phù hợp.</p>
  }

  return (
    <div className={GRID}>
      {products.map((product) => (
        // key: React uses it to know which card is which when the list changes
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
```

`ProductGrid` lo cả ba trạng thái của một danh sách: **đang tải** (khối xám nhấp nháy `animate-pulse`), **rỗng**, **có dữ liệu**. Trang nào cũng có ba trạng thái này, viết một lần dùng mãi.

Tạo `web/src/components/ErrorBox.tsx`:

```tsx
type Props = {
  error: Error
  onRetry?: () => void
}

// Shown when a query fails. error.message already holds the API's message (see lib/api.ts)
export default function ErrorBox({ error, onRetry }: Props) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <p>{error.message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 font-medium underline">
          Thử lại
        </button>
      )}
    </div>
  )
}
```

`error.message` đã là câu thông báo lấy từ API (task trước làm trong `lib/api.ts`). `onRetry` là tuỳ chọn: truyền vào thì có nút "Thử lại".

## Bước 3: Trang chủ

Thay toàn bộ `web/src/pages/HomePage.tsx`:

```tsx
import { Link } from 'react-router'
import ErrorBox from '../components/ErrorBox.tsx'
import ProductGrid from '../components/ProductGrid.tsx'
import { useCategories, useProducts } from '../lib/queries.ts'
import type { Category } from '../lib/types.ts'

export default function HomePage() {
  const featured = useProducts({ featured: true, limit: 8 })
  const categories = useCategories()

  return (
    <div className="space-y-10">
      <section className="rounded-2xl bg-gradient-to-r from-amber-300 to-amber-400 p-8">
        <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">
          Điện thoại, laptop chính hãng
        </h1>
        <p className="mt-2 text-slate-800">Giá tốt, giao nhanh, đổi trả trong 30 ngày.</p>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Sản phẩm nổi bật</h2>
        {featured.isError ? (
          <ErrorBox error={featured.error} onRetry={() => featured.refetch()} />
        ) : (
          <ProductGrid products={featured.data?.items} isPending={featured.isPending} skeletonCount={8} />
        )}
      </section>

      {/* One block per category; each block runs its own query */}
      {categories.data?.map((category) => (
        <CategorySection key={category.id} category={category} />
      ))}
    </div>
  )
}

// A separate component because hooks (useProducts) cannot be called inside a loop
function CategorySection({ category }: { category: Category }) {
  const { data, isPending, isError, error, refetch } = useProducts({
    category: category.slug,
    limit: 4,
  })

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-bold">{category.name}</h2>
        <Link to={`/san-pham?category=${category.slug}`} className="text-sm text-amber-700 hover:underline">
          Xem tất cả{data ? ` ${data.total} sản phẩm` : ''}
        </Link>
      </div>
      {isError ? (
        <ErrorBox error={error} onRetry={() => refetch()} />
      ) : (
        <ProductGrid products={data?.items} isPending={isPending} />
      )}
    </section>
  )
}
```

Giải thích:
- `featured.isError ? <ErrorBox .../> : <ProductGrid .../>`: lỗi thì báo lỗi, không thì để `ProductGrid` lo tải/rỗng/dữ liệu.
- `featured.data?.items`: `?.` vì lúc đang tải `data` là `undefined`.
- Mỗi danh mục là một component `CategorySection` riêng. Lý do: **luật của hook**, không được gọi hook (`useProducts`) trong vòng lặp, điều kiện hay hàm con. React nhận ra từng hook theo **thứ tự gọi**; số lần gọi thay đổi giữa các lần vẽ là hỏng. Tách component thì mỗi `CategorySection` gọi đúng một hook.
- Năm khối chạy 5 query **song song** (nổi bật + 4 danh mục). Danh mục lấy từ `useCategories()`, cùng cache với menu ở header: không tốn thêm request.
- `data.total` của mỗi khối cho chữ "Xem tất cả 9 sản phẩm" mà không cần thêm API.

## Bước 4: Chạy thử

Mở http://localhost:5173:
1. Khối "Sản phẩm nổi bật" có 5 sản phẩm (dữ liệu mẫu có 5 sản phẩm `isFeatured = 1`).
2. Bốn khối danh mục theo thứ tự `sortOrder`; khối Laptop ghi "Xem tất cả 9 sản phẩm", bấm vào sang `/san-pham?category=laptop`.
3. Bấm một thẻ: sang `/san-pham/<slug>`.
4. Thu nhỏ cửa sổ (hoặc DevTools → chế độ điện thoại): lưới còn 2 cột.
5. Thử nhãn "Hết hàng": chạy trong VS Code (database `TechStoreDb`)

   ```sql
   UPDATE v SET stock = 0
   FROM ProductVariants v JOIN Products p ON p.id = v.productId
   WHERE p.slug = 'pin-du-phong-xiaomi-10000mah';
   ```

   rồi tải lại trang: thẻ "Pin sạc dự phòng Xiaomi" trong khối Phụ kiện có nhãn "Hết hàng" (API tính `inStock` = tổng tồn kho > 0). Trả lại bằng `npm run db:reset`.
6. Tab Network → chọn "Slow 4G" rồi tải lại: thấy các khối xám trước khi dữ liệu về.

## Kiểm tra

- [ ] `npm run lint` và `npm run build` trong `web/` đều qua
- [ ] Trang chủ hiện đủ khối nổi bật + 4 khối danh mục; giá có định dạng `36.990.000 ₫`; thẻ giảm giá có giá gạch ngang và nhãn `-%`
- [ ] Thấy skeleton khi mạng chậm, thấy "Hết hàng" khi tồn kho bằng 0
- [ ] Giải thích được: vì sao `CategorySection` phải là component riêng; `key` trong `map` để làm gì
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Thêm logo hãng vào khối danh mục: dùng `useBrands()` (đã có trong `queries.ts`) và hiện một hàng logo `brand.logoUrl`, bấm vào sang `/san-pham?brand=<slug>`.
2. Tạm sửa `CategorySection` thành gọi `useProducts` bên trong `categories.data?.map(...)` của `HomePage` (bỏ component riêng). Chạy `npm run lint`: báo lỗi `rules-of-hooks`: `React Hook "useProducts" cannot be called inside a callback`. Trả lại như cũ.
