# TechStore

Website thương mại điện tử bán điện thoại, laptop, tablet và phụ kiện. Dự án học **NestJS + SQL Server + React** của team.

| Phần | Công nghệ | Thư mục |
| --- | --- | --- |
| Backend | NestJS 12, TypeORM | [`server/`](server/) |
| Database | Microsoft SQL Server 2022 (Docker) | [`docker-compose.yml`](docker-compose.yml) |
| Frontend | React 19, Vite, Tailwind CSS | [`web/`](web/) |
| Bài học | Hướng dẫn từng phần, gõ theo để học | [`AI/tech-store-bai-hoc.md`](AI/tech-store-bai-hoc.md) |
| Giáo trình | NestJS cơ bản cho người mới bắt đầu (dùng SQL Server), Bài 1–10 | [`docs/nestjs-co-ban-sql-server.pdf`](docs/nestjs-co-ban-sql-server.pdf) |

## 1. Cài đặt công cụ (một lần)

| Công cụ | Phiên bản | Kiểm tra |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | 22 LTS trở lên | `node -v` |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | bản mới | `docker -v` |
| [Git](https://git-scm.com) | bản mới | `git -v` |
| VS Code | | Mở repo, cài các extension được gợi ý (SQL Server, Prettier, Tailwind, Oxc, Docker) |

Windows: nếu PowerShell báo `running scripts is disabled`, chạy một lần lệnh dưới đây rồi mở terminal mới:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 2. Chạy ở máy local

```powershell
git clone https://github.com/<tai-khoan>/tech-store.git
cd tech-store
copy .env.example .env      # macOS/Linux: cp .env.example .env
npm run setup               # cài thư viện cho thư mục gốc, server và web
npm run db:up               # bật SQL Server (Docker Desktop phải đang chạy), tự tạo database TechStoreDb
npm run dev                 # chạy API + web cùng lúc
```

Mở http://localhost:5173. Trang hiện **"API: TechStore API ..."** và **"SQL Server: đã kết nối"** là thành công.

| Địa chỉ | Là gì |
| --- | --- |
| http://localhost:5173 | Web React. Request `/api` được Vite chuyển sang API |
| http://localhost:3000/api/v1 | API NestJS |
| http://localhost:3000/api/v1/health | Kiểm tra API và database: `{"status":"ok","database":"up"}` |
| `localhost,1433` | SQL Server, đăng nhập bằng `sa` / mật khẩu `DB_PASSWORD` trong `.env` |

Lần chạy `db:up` đầu tiên sẽ tải image SQL Server khoảng 1,5GB.

Dừng: `Ctrl+C` để tắt API và web. Muốn tắt SQL Server thì chạy `npm run db:down`, dữ liệu vẫn giữ nguyên trong Docker volume.

### Chạy toàn bộ bằng Docker (không cần chạy Node ở máy)

```powershell
npm run app:up      # build và chạy SQL Server + API + web trong Docker
```

Mở http://localhost:8080. Tắt bằng `npm run app:down`. Chế độ này dùng để thử bản build giống production. Khi code hằng ngày, dùng `npm run dev` để được tự reload.

## 3. Các lệnh

Chạy từ thư mục gốc:

| Lệnh | Tác dụng |
| --- | --- |
| `npm run setup` | Cài thư viện (chạy lại sau mỗi lần `git pull` có thay đổi `package.json`) |
| `npm run dev` | Chạy API (cổng 3000) và web (cổng 5173), tự reload khi sửa code |
| `npm run db:up` / `db:down` / `db:logs` | Bật / tắt / xem log SQL Server |
| `npm run app:up` / `app:down` | Chạy / tắt toàn bộ hệ thống bằng Docker |
| `npm test` | Unit test của API (không cần SQL Server) |
| `npm run test:e2e` | E2E test của API (cần SQL Server đang chạy) |
| `npm run lint` | Kiểm tra code server và web |
| `npm run build` | Build server và web |

## 4. Biến môi trường (`.env`)

Chỉ có **một** file `.env` ở thư mục gốc, dùng chung cho Docker (SQL Server) và API.

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` / `production` |
| `PORT` | `3000` | Cổng của API |
| `DB_HOST` | `localhost` | Máy chủ SQL Server. Khi API chạy trong Docker, tự đổi thành `sqlserver` |
| `DB_PORT` | `1433` | Cổng SQL Server |
| `DB_USERNAME` | `sa` | Tài khoản SQL Server |
| `DB_PASSWORD` | `TechStore@123` | Mật khẩu, cũng là mật khẩu `sa` của container SQL Server. Phải đủ mạnh: ít nhất 8 ký tự, có 3 trong 4 loại chữ hoa, chữ thường, số, ký tự đặc biệt |
| `DB_NAME` | `TechStoreDb` | Tên database, được tạo tự động |
| `DB_SYNCHRONIZE` | `true` | TypeORM tự tạo và sửa bảng theo entity. **Chỉ dùng ở máy local** |

`.env` không bao giờ được commit. Thêm biến mới thì cập nhật cả `.env.example`.

Đổi `DB_PASSWORD` **sau khi** container SQL Server đã được tạo sẽ không đổi mật khẩu trong database. Muốn làm lại từ đầu: `docker compose down -v`. Lệnh này **xoá toàn bộ dữ liệu**, rồi chạy `npm run db:up` lại.

## 5. Cấu trúc thư mục

```
tech-store/
  AI/tech-store-bai-hoc.md   # bài học từng phần
  docs/                      # tài liệu: giáo trình NestJS + SQL Server (PDF)
  docker-compose.yml         # SQL Server; profile "app" thêm API + web
  .env.example               # mẫu cấu hình, copy thành .env
  package.json               # lệnh chung: setup, dev, db:up...
  server/                    # NestJS API
    src/
      main.ts                # khởi động app, tiền tố /api/v1
      app.module.ts          # module gốc: đọc .env, kết nối SQL Server
      app.controller.ts      # GET /api/v1, GET /api/v1/health
      app.service.ts
    test/                    # e2e test
    Dockerfile
  web/                       # React app
    src/App.tsx
    vite.config.ts           # proxy /api → localhost:3000
    nginx.conf               # dùng trong Docker: phục vụ web + proxy /api
    Dockerfile
```

## 6. Quy ước làm việc nhóm

- **Không code thẳng trên `main`.** Tạo nhánh cho mỗi việc, ví dụ `git switch -c feature/categories`. Push nhánh lên và tạo **Pull Request** để teammate review rồi mới merge.
- Trước khi bắt đầu: `git switch main`, `git pull`, rồi `npm run setup` nếu có thư viện mới.
- Comment trong code và commit message viết bằng **tiếng Anh**. Chữ hiển thị trên giao diện viết bằng tiếng Việt.
- Trước khi tạo Pull Request: `npm run lint` và `npm test` phải qua.

## 7. Lỗi hay gặp

| Triệu chứng | Cách xử lý |
| --- | --- |
| `Missing .env - copy .env.example to .env first` | Chưa tạo `.env`: `copy .env.example .env` |
| `error during connect ... dockerDesktopLinuxEngine` | Docker Desktop chưa mở hoặc chưa khởi động xong |
| `port is already allocated` ở cổng 1433 | Máy đã có SQL Server khác chiếm cổng. Tắt nó, hoặc sửa `ports` thành `'1434:1433'` và đặt `DB_PORT=1434` |
| Container SQL Server tự tắt | Xem `npm run db:logs`. Thường do `DB_PASSWORD` không đủ mạnh |
| API báo `Unable to connect to the database. Retrying...` | SQL Server chưa chạy: `npm run db:up` |
| `Login failed for user 'sa'` | `DB_PASSWORD` khác mật khẩu lúc tạo container. Xem mục 4 |
| Web báo `HTTP 500` hoặc `HTTP 502` | API chưa chạy hoặc đã lỗi. Xem log `[api]` trong terminal `npm run dev` |
| `Cannot find module './x'` trong server | Import file nội bộ phải có đuôi `.js`: `'./app.service.js'` |
| `Cannot read properties of null (reading 'edgesOut')` khi tạo project NestJS mới | npm quá cũ: `npm install -g npm@latest` |
