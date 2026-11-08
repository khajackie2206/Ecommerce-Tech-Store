## Mục tiêu

Mỗi thành viên clone repo và chạy được toàn bộ hệ thống (SQL Server, API, web) trên máy mình.

## Các bước

1. Cài công cụ (một lần): **Node.js 22**, **Docker Desktop**, **Git**, **VS Code**. Mở repo trong VS Code và cài các extension được gợi ý (góc dưới bên phải hiện thông báo "install recommended extensions"): SQL Server (mssql), Prettier, Tailwind CSS IntelliSense, Oxc, Docker, REST Client.
2. Windows: nếu PowerShell báo `running scripts is disabled`, chạy một lần rồi mở terminal mới:

   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```

3. Clone và chạy:

   ```powershell
   cd C:\NodeJS
   git clone https://github.com/khajackie2206/Ecommerce-Tech-Store.git tech-store
   cd tech-store
   copy .env.example .env
   npm run setup        # cài thư viện cho gốc, server, web
   npm run db:up        # bật SQL Server (Docker Desktop phải đang chạy)
   npm run db:reset     # tạo bảng + dữ liệu mẫu
   npm run dev          # chạy API + web
   ```

4. Đặt tên/email Git **cho riêng repo này** (không ảnh hưởng repo công ty):

   ```powershell
   git config user.name "<tai-khoan-github>"
   git config user.email "<email-ca-nhan>"
   ```

## Kiểm tra

- [ ] http://localhost:5173 hiện "API: TechStore API ..." và "SQL Server: đã kết nối"
- [ ] http://localhost:3000/api/v1/health trả `{"status":"ok","database":"up"}`
- [ ] Kết nối SQL Server bằng extension SQL Server trong VS Code (server `localhost`, user `sa`, mật khẩu `DB_PASSWORD` trong `.env`, bật Trust server certificate), thấy 8 bảng trong `TechStoreDb`
- [ ] Chạy được các câu trong `docs/sql/inspect-database.sql`

## Gặp lỗi?

Xem mục **Lỗi hay gặp** trong `README.md` ở thư mục gốc.
