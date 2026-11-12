## Mục tiêu

Biến trang "kiểm tra kết nối" của Phần 1 thành **khung cửa hàng**: header (logo, ô tìm kiếm, menu danh mục), footer, và các trang theo URL:

| URL | Trang | Ở task này |
|---|---|---|
| `/` | Trang chủ | Trang tạm, task "Trang chủ" làm thật |
| `/san-pham?category=laptop&q=...` | Danh sách sản phẩm | In ra bộ lọc đọc từ URL |
| `/san-pham/iphone-17-pro-max` | Chi tiết sản phẩm | In ra `slug` đọc từ URL |
| URL lạ bất kỳ | 404 | Trang "Không tìm thấy trang" |

Menu danh mục lấy thật từ `GET /api/v1/categories`. Ô tìm kiếm chuyển sang `/san-pham?q=...`.

**Làm sau:** Phần 1 (web chạy được ở http://localhost:5173). API chỉ cần `GET /categories` (có từ Phần 2) và `GET /health`. Đây là task **đầu tiên** của Phần 9: các task React khác đều dựa trên nó, làm xong và merge trước.

**Đọc trước:**
- https://react.dev/learn: "Describing the UI" và "Adding Interactivity" (component, props, state).
- https://reactrouter.com/start/declarative/routing (cách khai báo route).

## React cho người quen PHP

Trong PHP (WordPress, Laravel Blade...), mỗi lần bấm link là trình duyệt **tải lại cả trang** HTML mới từ server. React làm khác:

| | PHP truyền thống | React (SPA, Single Page Application) |
|---|---|---|
| HTML tạo ở đâu | Server | Trình duyệt, bằng JavaScript |
| Bấm link | Tải lại toàn bộ trang | Chỉ đổi phần nội dung, header/footer giữ nguyên |
| Lấy dữ liệu | Query DB trong template | Gọi API JSON (NestJS) |
| "Trang" là gì | Một file `.php` | Một **component** gắn với một URL |

Ba ý chính để đọc code bên dưới:
- **Component** là một function trả về JSX (cú pháp giống HTML viết trong JS). Tên viết hoa: `Header`, `HomePage`. Dùng như thẻ: `<Header />`.
- **State** (`useState`) là biến mà khi đổi giá trị thì React **vẽ lại** component. Giống biến trong template PHP, nhưng trang tự cập nhật, không cần reload.
- **Router** đọc URL trên thanh địa chỉ và chọn component để hiện. Đổi URL bằng `<Link>` thì không reload trang.

## Bước 1: Cài React Router

```powershell
cd web
npm install react-router
```

Bản cài được là `react-router` **8.x**. Nhiều bài viết cũ dùng gói `react-router-dom`; từ bản 7 mọi thứ đã gộp vào `react-router`, không cần gói kia.

Sau khi PR merge, teammate pull về phải chạy `npm run setup` (ở thư mục gốc) để cài thư viện mới.

## Bước 2: Bật router cho cả app

Thay toàn bộ `web/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Lets every component read and change the URL (<Link>, useParams, useNavigate...) */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
```

`<BrowserRouter>` theo dõi URL của trình duyệt. Mọi component nằm bên trong nó mới dùng được `<Link>`, `useParams`, `useNavigate`...

## Bước 3: Khai báo các route

Thay toàn bộ `web/src/App.tsx` (trang kiểm tra kết nối cũ chuyển xuống footer ở Bước 6):

```tsx
import { Route, Routes } from 'react-router'
import Layout from './components/Layout.tsx'
import HomePage from './pages/HomePage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'
import ProductDetailPage from './pages/ProductDetailPage.tsx'
import ProductListPage from './pages/ProductListPage.tsx'

// URL -> page. Every route sits inside <Layout>, so all pages share the header and footer.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="san-pham" element={<ProductListPage />} />
        <Route path="san-pham/:slug" element={<ProductDetailPage />} />
        {/* "*" matches any URL not listed above */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
```

- `<Route element={<Layout />}>` không có `path`: đây là **route cha** chỉ để bọc layout. Các route con bên trong đều hiện trong layout đó.
- `index`: route của đúng đường dẫn cha (`/`).
- `path="san-pham/:slug"`: `:slug` là **tham số động**. URL `/san-pham/iphone-17-pro-max` cho `slug = "iphone-17-pro-max"`. Giống `@Param('slug')` bên NestJS.
- `path="*"`: bắt mọi URL còn lại, đặt cuối để làm trang 404.
- Query string (`?category=laptop`) **không** khai báo ở route; trang tự đọc bằng `useSearchParams` (Bước 7).

## Bước 4: Layout

Tạo `web/src/components/Layout.tsx`:

```tsx
import { Outlet } from 'react-router'
import Footer from './Footer.tsx'
import Header from './Header.tsx'

// Frame shared by every page: header on top, footer at the bottom
export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-800">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {/* React Router renders the page that matches the current URL here */}
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
```

`<Outlet />` là "chỗ trống" để router đặt trang con vào, giống `@yield('content')` trong Blade. Header và footer chỉ render một lần, chuyển trang chỉ đổi phần giữa.

## Bước 5: Header

Tạo `web/src/components/Header.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'

type Category = { id: number; name: string; slug: string; isActive: boolean }

export default function Header() {
  const [categories, setCategories] = useState<Category[]>([])
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '')

  // Load the category menu once, after the first render
  useEffect(() => {
    fetch('/api/v1/categories')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Category[]) => setCategories(data.filter((c) => c.isActive)))
      .catch(() => setCategories([]))
  }, [])

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

Giải thích:
- `useEffect(() => {...}, [])`: chạy **sau** lần vẽ đầu tiên. Mảng rỗng `[]` = chỉ chạy một lần. Đây là chỗ gọi API khi component xuất hiện. (Task sau sẽ thay bằng TanStack Query, gọn và mạnh hơn.)
- `<Link to="/san-pham">` thay cho `<a href>`: đổi URL mà **không tải lại trang**. Dùng `<a href>` cho link nội bộ là lỗi hay gặp: trang vẫn chạy nhưng bị reload toàn bộ, mất state.
- Ô tìm kiếm là **controlled input**: `value={keyword}` + `onChange` cập nhật state. React luôn biết ô đang chứa gì.
- `event.preventDefault()` trong `handleSearch`: chặn hành vi mặc định của `<form>` (gửi đi và tải lại trang), rồi tự chuyển trang bằng `navigate(...)`.
- `encodeURIComponent(q)`: từ khoá có dấu cách, dấu `&`... phải mã hoá trước khi đặt vào URL.
- Mục menu đang chọn được tính tay từ `location.pathname` và `searchParams.get('category')`. Có component `<NavLink>` tự làm việc này, nhưng nó chỉ so **đường dẫn**, không so query string, nên ở đây mọi mục `/san-pham?category=...` sẽ cùng sáng.
- ``className={`... ${...}`}``: Tailwind dùng class, nên class "đang chọn" được ghép bằng template string.
- "Đăng nhập" và "Giỏ hàng (0)" tạm là chữ mờ; Phần 10 làm thật.

## Bước 6: Footer, nơi giữ lại dòng kiểm tra kết nối

Tạo `web/src/components/Footer.tsx`:

```tsx
import { useEffect, useState } from 'react'

type Health = { status: 'ok' | 'error'; database: 'up' | 'down' }

// The Part 1 status check lives on as a small line in the footer
export default function Footer() {
  const [dbUp, setDbUp] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/v1/health')
      .then((res) => res.json() as Promise<Health>)
      .then((health) => setDbUp(health.database === 'up'))
      .catch(() => setDbUp(false))
  }, [])

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

Trang kiểm tra kết nối của Phần 1 rất hữu ích khi cài máy mới, nên ta giữ lại một dòng nhỏ "SQL Server: đã kết nối" ở cuối mọi trang. Teammate mới clone repo vẫn nhìn footer để biết API và database đã chạy.

## Bước 7: Bốn trang tạm

Tạo `web/src/pages/HomePage.tsx`:

```tsx
import { Link } from 'react-router'

// Placeholder: the "Trang chủ" task fills this page with real products
export default function HomePage() {
  return (
    <section className="rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold">Điện thoại, laptop chính hãng</h1>
      <p className="mt-2 text-slate-500">Sản phẩm nổi bật sẽ xuất hiện ở đây.</p>
      <Link
        to="/san-pham"
        className="mt-4 inline-block rounded-lg bg-amber-400 px-4 py-2 font-medium hover:bg-amber-500"
      >
        Xem tất cả sản phẩm
      </Link>
    </section>
  )
}
```

Tạo `web/src/pages/ProductListPage.tsx`:

```tsx
import { useSearchParams } from 'react-router'

// Placeholder: shows the filters read from the URL; the list task builds the real page
export default function ProductListPage() {
  const [searchParams] = useSearchParams()

  return (
    <section>
      <h1 className="text-xl font-bold">Sản phẩm</h1>
      <p className="mt-2 text-sm text-slate-500">Bộ lọc đọc từ URL:</p>
      <pre className="mt-2 rounded-lg bg-white p-4 text-sm shadow-sm">
        {JSON.stringify(Object.fromEntries(searchParams), null, 2)}
      </pre>
    </section>
  )
}
```

Tạo `web/src/pages/ProductDetailPage.tsx`:

```tsx
import { useParams } from 'react-router'

// Placeholder: reads ":slug" from the URL; the detail task loads the product
export default function ProductDetailPage() {
  const { slug } = useParams()

  return (
    <section>
      <h1 className="text-xl font-bold">Chi tiết sản phẩm</h1>
      <p className="mt-2 text-slate-500">
        slug trên URL: <code className="rounded bg-white px-1">{slug}</code>
      </p>
    </section>
  )
}
```

Tạo `web/src/pages/NotFoundPage.tsx`:

```tsx
import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <section className="py-16 text-center">
      <p className="text-6xl font-extrabold text-amber-400">404</p>
      <h1 className="mt-4 text-xl font-bold">Không tìm thấy trang</h1>
      <p className="mt-2 text-slate-500">Đường dẫn không đúng hoặc trang đã bị xoá.</p>
      <Link to="/" className="mt-6 inline-block text-amber-700 underline">
        Về trang chủ
      </Link>
    </section>
  )
}
```

- `useSearchParams()` trả về query string hiện tại (giống `$_GET`). `searchParams.get('category')` → `"laptop"` hoặc `null`.
- `useParams()` trả về các tham số động của route: `{ slug: "iphone-17-pro-max" }`.
- Ba trang đầu chỉ in dữ liệu đọc từ URL, để thấy router hoạt động; các task sau thay bằng trang thật.

## Bước 8: Chạy thử

```powershell
npm run dev   # ở thư mục gốc: chạy cả API và web
```

Mở http://localhost:5173 và thử:
1. Menu có "Tất cả, Điện thoại, Laptop, Máy tính bảng, Phụ kiện" (lấy từ database). Footer: "SQL Server: đã kết nối".
2. Bấm **Laptop**: URL thành `/san-pham?category=laptop`, trang in `"category": "laptop"`, mục Laptop gạch chân. Mở tab Network của DevTools: **không** có request tải lại trang HTML.
3. Gõ "galaxy s25" vào ô tìm kiếm, Enter: URL thành `/san-pham?q=galaxy%20s25`.
4. Bấm nút **Back** của trình duyệt: quay về trang trước như web thường.
5. Đang ở `/san-pham?category=laptop`, bấm F5: vẫn đúng trang đó. Vite (lúc dev) và nginx trong Docker (`try_files ... /index.html` trong `web/nginx.conf`) trả `index.html` cho mọi đường dẫn, rồi React Router đọc URL và chọn trang.
6. Mở http://localhost:5173/abc: trang 404.

## Kiểm tra

- [ ] `npm run lint` và `npm run build` trong `web/` đều qua
- [ ] Đủ 4 loại URL ở bảng đầu, kể cả 404; F5 ở mọi trang vẫn đúng trang
- [ ] Menu danh mục lấy từ API (thử thêm một danh mục qua Swagger rồi tải lại trang)
- [ ] Giải thích được: `<Link>` khác `<a href>` thế nào; `<Outlet />` để làm gì; `:slug` và `?category=` đọc bằng hook nào
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Thêm trang `/gioi-thieu` (giới thiệu cửa hàng) và link tới nó trong footer.
2. Đổi một `<Link>` trong menu thành `<a href="...">`, bấm thử và xem tab Network: cả trang được tải lại (file JS, CSS tải lại từ đầu). Nhớ đổi lại.
3. Tắt API (Ctrl+C rồi chỉ chạy `npm run dev` trong `web/`): menu trống, footer báo "không kết nối được". Trang vẫn hiện, không "trắng xoá": đó là lý do mỗi lời gọi API đều có `.catch`.
