## Mục tiêu

Trang `/san-pham` thật, dùng API danh sách của Phần 6:

- Bộ lọc: danh mục, hãng, mức giá (5 khoảng), sắp xếp (mới nhất, giá tăng/giảm, tên A-Z), từ khoá từ ô tìm kiếm ở header.
- Phân trang 12 sản phẩm mỗi trang.
- Trạng thái đang tải, rỗng, lỗi; nút "Xoá bộ lọc".
- **Mọi bộ lọc nằm trên URL**: `/san-pham?category=laptop&brand=asus&minPrice=20000000&maxPrice=30000000&sort=price_asc&page=2`. Tải lại trang, bấm Back, gửi link cho bạn: đều ra đúng kết quả đó.

**Làm sau:** task "Trang chủ" (dùng lại `ProductGrid`, `ErrorBox`). Song song được với task "Trang chi tiết sản phẩm".

**Đọc trước:** https://reactrouter.com/api/hooks/useSearchParams; nhắc lại tham số của `GET /products` trong task "API danh sách sản phẩm" (Phần 6).

## Vì sao để bộ lọc trên URL thay vì `useState`?

Nếu giữ bộ lọc trong `useState`, tải lại trang là mất, nút Back không quay về bộ lọc trước, và không chia sẻ được link "laptop ASUS dưới 30 triệu". Trang PHP truyền thống làm đúng điều này một cách tự nhiên (`$_GET`), ta làm lại y như vậy: **URL là nơi duy nhất giữ bộ lọc**, trang chỉ đọc URL rồi gọi API.

```
Người dùng chọn "Laptop"  →  đổi URL (?category=laptop)  →  trang đọc URL  →  useProducts({ category: 'laptop' })  →  API
```

## Bước 1: Component phân trang

Tạo `web/src/components/Pagination.tsx`:

```tsx
type Props = {
  page: number
  totalPages: number
  onChange: (page: number) => void
}

// Page numbers to show, e.g. page 6 of 12 -> [1, '…', 5, 6, 7, '…', 12]
function pageItems(page: number, totalPages: number): (number | '…')[] {
  const pages = new Set([1, totalPages, page - 1, page, page + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  const items: (number | '…')[] = []
  sorted.forEach((p, index) => {
    if (index > 0 && p - sorted[index - 1] > 1) items.push('…')
    items.push(p)
  })
  return items
}

export default function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null

  const button = 'min-w-9 rounded-lg px-3 py-1.5 text-sm disabled:opacity-40'

  return (
    <nav aria-label="Phân trang" className="mt-6 flex flex-wrap items-center justify-center gap-1">
      <button type="button" className={`${button} bg-white`} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹ Trước
      </button>
      {pageItems(page, totalPages).map((item, index) =>
        item === '…' ? (
          <span key={`gap-${index}`} className="px-2 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-current={item === page ? 'page' : undefined}
            className={`${button} ${item === page ? 'bg-amber-400 font-semibold' : 'bg-white'}`}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        className={`${button} bg-white`}
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Sau ›
      </button>
    </nav>
  )
}
```

- Chỉ hiện trang đầu, trang cuối và các trang cạnh trang hiện tại, chỗ bị bỏ thay bằng `…` (12 trang, đang ở trang 6: `1 … 5 6 7 … 12`).
- `aria-current="page"` đánh dấu trang hiện tại cho trình đọc màn hình.
- Không tự đổi URL: nhận `onChange` từ trang cha. Component chỉ hiển thị, trang cha quyết định làm gì. Nhờ vậy dùng lại được cho danh sách đơn hàng ở phần sau.

## Bước 2: Trang danh sách

Thay toàn bộ `web/src/pages/ProductListPage.tsx`:

```tsx
import { useSearchParams } from 'react-router'
import ErrorBox from '../components/ErrorBox.tsx'
import Pagination from '../components/Pagination.tsx'
import ProductGrid from '../components/ProductGrid.tsx'
import { useBrands, useCategories, useProducts } from '../lib/queries.ts'
import type { ProductListParams, ProductSort } from '../lib/types.ts'

const PAGE_SIZE = 12

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price_asc', label: 'Giá thấp đến cao' },
  { value: 'price_desc', label: 'Giá cao đến thấp' },
  { value: 'name_asc', label: 'Tên A-Z' },
]

// Price ranges in VND; "" means no limit on that side
const PRICE_RANGES = [
  { label: 'Dưới 5 triệu', min: '', max: '5000000' },
  { label: '5 - 10 triệu', min: '5000000', max: '10000000' },
  { label: '10 - 20 triệu', min: '10000000', max: '20000000' },
  { label: '20 - 30 triệu', min: '20000000', max: '30000000' },
  { label: 'Trên 30 triệu', min: '30000000', max: '' },
]

// "12" -> 12; missing or invalid -> undefined (the API then uses its default)
function toNumber(value: string | null): number | undefined {
  if (value === null || value === '') return undefined
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : undefined
}

export default function ProductListPage() {
  // The URL is the single source of truth for the filters:
  // reload, back button and shared links all show the same results.
  const [searchParams, setSearchParams] = useSearchParams()

  const sortParam = searchParams.get('sort')
  const params: ProductListParams = {
    category: searchParams.get('category') ?? undefined,
    brand: searchParams.get('brand') ?? undefined,
    q: searchParams.get('q') ?? undefined,
    minPrice: toNumber(searchParams.get('minPrice')),
    maxPrice: toNumber(searchParams.get('maxPrice')),
    sort: SORT_OPTIONS.some((option) => option.value === sortParam)
      ? (sortParam as ProductSort)
      : 'newest',
    page: toNumber(searchParams.get('page')) || 1,
    limit: PAGE_SIZE,
  }

  const products = useProducts(params)
  const { data: categories = [] } = useCategories()
  const { data: brands = [] } = useBrands()

  // Change some filters. Any change except the page number goes back to page 1.
  function updateFilters(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    if (!('page' in changes)) next.delete('page')
    setSearchParams(next)
  }

  const category = categories.find((c) => c.slug === params.category)
  const title = params.q ? `Kết quả cho "${params.q}"` : (category?.name ?? 'Tất cả sản phẩm')
  const totalPages = products.data ? Math.ceil(products.data.total / PAGE_SIZE) : 0
  const activePrice = PRICE_RANGES.find(
    (range) =>
      range.min === (searchParams.get('minPrice') ?? '') &&
      range.max === (searchParams.get('maxPrice') ?? ''),
  )
  const hasFilters = [...searchParams.keys()].some((key) => key !== 'sort' && key !== 'page')

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <aside className="space-y-6 rounded-xl bg-white p-4 text-sm shadow-sm md:self-start">
        <fieldset>
          <legend className="mb-2 font-semibold">Danh mục</legend>
          <select
            value={params.category ?? ''}
            onChange={(event) => updateFilters({ category: event.target.value })}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
            aria-label="Danh mục"
          >
            <option value="">Tất cả danh mục</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-semibold">Hãng</legend>
          <select
            value={params.brand ?? ''}
            onChange={(event) => updateFilters({ brand: event.target.value })}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
            aria-label="Hãng"
          >
            <option value="">Tất cả hãng</option>
            {brands.map((b) => (
              <option key={b.id} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-semibold">Mức giá</legend>
          <div className="flex flex-wrap gap-2 md:flex-col md:items-start">
            {PRICE_RANGES.map((range) => {
              const active = range === activePrice
              return (
                <button
                  key={range.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    updateFilters(
                      active ? { minPrice: null, maxPrice: null } : { minPrice: range.min, maxPrice: range.max },
                    )
                  }
                  className={`rounded-full border px-3 py-1 ${
                    active ? 'border-amber-500 bg-amber-100 font-medium' : 'border-slate-300'
                  }`}
                >
                  {range.label}
                </button>
              )
            })}
          </div>
        </fieldset>

        {hasFilters && (
          <button type="button" onClick={() => setSearchParams({})} className="text-amber-700 underline">
            Xoá bộ lọc
          </button>
        )}
      </aside>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            {products.data && <p className="text-sm text-slate-500">{products.data.total} sản phẩm</p>}
          </div>
          <select
            value={params.sort}
            onChange={(event) => updateFilters({ sort: event.target.value })}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
            aria-label="Sắp xếp"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {products.isError ? (
          <ErrorBox error={products.error} onRetry={() => products.refetch()} />
        ) : (
          // Dim the old results while the next filter/page is loading
          <div className={products.isPlaceholderData ? 'opacity-50 transition-opacity' : ''}>
            <ProductGrid products={products.data?.items} isPending={products.isPending} skeletonCount={8} />
          </div>
        )}

        <Pagination
          page={params.page ?? 1}
          totalPages={totalPages}
          onChange={(page) => {
            updateFilters({ page: String(page) })
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
      </section>
    </div>
  )
}
```

Giải thích:
- `const [searchParams, setSearchParams] = useSearchParams()`: đọc và ghi query string. `setSearchParams(next)` đổi URL (và thêm một mục vào lịch sử, nên nút Back hoạt động).
- Mỗi lần vẽ, `params` được **tính lại từ URL**. Không có state nào cho bộ lọc, nên không có chuyện state và URL lệch nhau.
- `toNumber()` và kiểm tra `sort`: URL do người dùng gõ được, có thể là `?page=-2&sort=hack`. Giá trị sai bị bỏ qua (dùng mặc định) thay vì gửi lên API để nhận 400.
- `updateFilters({ brand: 'asus' })`: copy query string hiện tại, đổi vài khoá, **xoá `page`** (đang ở trang 3 mà đổi bộ lọc thì phải về trang 1, nếu không có thể rơi vào trang trống). Giá trị rỗng thì xoá khoá cho URL gọn.
- `<select value={...} onChange={...}>`: select "có kiểm soát", giá trị luôn lấy từ URL.
- Mức giá là các nút bật/tắt: bấm lần nữa vào khoảng đang chọn thì bỏ lọc giá. `aria-pressed` cho biết nút đang bật.
- `products.isPlaceholderData`: đang hiện kết quả **cũ** trong lúc chờ kết quả mới (`keepPreviousData` ở task trước). Ta làm mờ lưới để người dùng biết đang tải.
- `window.scrollTo(...)` khi đổi trang: cuộn lên đầu danh sách, không thì người dùng đứng ở cuối trang mới.
- Ô tìm kiếm ở header vẫn hoạt động như cũ: nó chuyển sang `/san-pham?q=...`, trang này đọc `q` và đổi tiêu đề thành `Kết quả cho "..."`.

## Bước 3: Chạy thử

Mở http://localhost:5173/san-pham:
1. "25 sản phẩm", 12 thẻ, phân trang `1 2 3`. Bấm `3`: URL `?page=3`, còn 1 sản phẩm.
2. Chọn Danh mục **Laptop**: "9 sản phẩm", `page` biến khỏi URL. Chọn sắp xếp **Giá thấp đến cao**: giá tăng dần.
3. Mở `/san-pham?category=dien-thoai&brand=apple`: 4 sản phẩm. Bấm **20 - 30 triệu**: URL thêm `minPrice=20000000&maxPrice=30000000`, nút đổi màu. Bấm **Back**: quay về 4 sản phẩm.
4. Gõ "galaxy" ở ô tìm kiếm: tiêu đề `Kết quả cho "galaxy"`, 4 sản phẩm. Gõ "khongcogi": "Chưa có sản phẩm phù hợp.".
5. Mở `/san-pham?minPrice=abc&page=-2&sort=hack`: vẫn ra 25 sản phẩm, không lỗi.
6. Bấm **Xoá bộ lọc**: về `/san-pham`.
7. DevTools → Network → "Slow 4G", đổi trang: lưới cũ mờ đi tới khi trang mới về, không nhấp nháy trắng.

## Kiểm tra

- [ ] `npm run lint` và `npm run build` trong `web/` đều qua
- [ ] Mọi bộ lọc, sắp xếp, trang đều nằm trên URL; F5 và nút Back giữ đúng kết quả
- [ ] Đổi bộ lọc thì về trang 1; tham số URL sai không làm trang lỗi
- [ ] Giải thích được: vì sao không lưu bộ lọc bằng `useState`; `isPlaceholderData` dùng để làm gì
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Thêm ô "Giá từ ... đến ..." (hai `<input type="number">` và nút "Áp dụng") cho khoảng giá tuỳ ý. Gợi ý: giữ giá trị đang gõ trong `useState`, chỉ ghi lên URL khi bấm "Áp dụng".
2. Ô tìm kiếm ở header không tự xoá chữ khi bấm "Xoá bộ lọc". Sửa: trong `Header.tsx`, đặt `key={searchParams.get('q') ?? ''}` cho `<form>` và cho `<input>` dùng `name="q"` cùng `defaultValue` thay cho `value`/`onChange`, rồi đọc từ khoá bằng `new FormData(event.currentTarget).get('q')`. Giải thích vì sao đổi `key` làm React tạo lại ô nhập.
