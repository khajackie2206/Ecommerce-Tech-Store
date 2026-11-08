## Mục tiêu

Hiểu từng file của source dựng sẵn và đường đi của một request, trước khi bắt đầu viết code ở Phần 2.

## Các bước

1. Đọc **Bài 1, 2, 3** trong giáo trình `docs/nestjs-co-ban-sql-server.pdf` (cài đặt, TypeScript tối thiểu, controller).
2. Đọc **Phần 1** trong `AI/tech-store-bai-hoc.md`, mở từng file được nhắc tới trong VS Code để đọc song song.
3. Làm các thử nghiệm ở **Bước 6** của Phần 1 (tắt database, đổi tên `.env`, đổi `'DB_NAME'`...), quan sát lỗi rồi sửa lại.
4. Bài tập nhỏ: thêm route `GET /api/v1/ping` trả `{ "pong": true }` vào `server/src/app.controller.ts`:

   ```ts
   // GET /api/v1/ping - quick check that the API answers
   @Get('ping')
   ping() {
     return { pong: true };
   }
   ```

   Lưu file, xem log có dòng `Mapped {/api/v1/ping, GET} route`, mở http://localhost:3000/api/v1/ping.

## Câu hỏi tự kiểm tra (trả lời được thì task xong)

- [ ] Controller, service, module khác nhau thế nào? File nào trong `server/src` là cái nào?
- [ ] Vì sao `AppService` có `DataSource` mà không ai viết `new DataSource()`?
- [ ] Vì sao import phải ghi đuôi `.js` dù file là `.ts`?
- [ ] Request từ web ở cổng 5173 đi tới API ở cổng 3000 bằng cách nào?
- [ ] Database `TechStoreDb` được tạo lúc nào, ở đâu?

Giải thích lại cho teammate là cách kiểm tra tốt nhất.
