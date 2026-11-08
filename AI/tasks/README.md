# Hướng dẫn chi tiết cho từng task

Mỗi file trong thư mục này là hướng dẫn của **một issue** trên GitHub (bảng TechStore). Nội dung trong issue và trong file là một.

Cách học một task:
1. Nhận task trên GitHub: mở issue, bấm **Assignees** chọn mình, kéo thẻ sang **In progress**.
2. Tạo nhánh từ `main` mới nhất: trong issue bấm **Create a branch**, hoặc `git switch main && git pull && git switch -c <ten-nhanh>`.
3. Đọc phần "Vì sao" trước, rồi **gõ lại** code (đừng copy): gõ sai rồi tự sửa là cách nhớ lâu nhất.
4. Chạy phần "Kiểm tra" cho tới khi tất cả đều đúng.
5. Commit (message tiếng Anh), push, tạo Pull Request có dòng `Closes #<số issue>`, nhờ teammate review.

| Phần | Task | File |
|---|---|---|
| 1 | Cài môi trường và chạy được source | [p1-1-setup.md](p1-1-setup.md) |
| 1 | Đọc hiểu source dựng sẵn | [p1-2-read-source.md](p1-2-read-source.md) |
| 2 | Module categories (lưu trong bộ nhớ) | [p2-1-categories-module.md](p2-1-categories-module.md) |
| 2 | Module brands (lưu trong bộ nhớ) | [p2-2-brands-module.md](p2-2-brands-module.md) |
| 3 | Bật ValidationPipe toàn cục | [p3-1-validation-pipe.md](p3-1-validation-pipe.md) |
| 3 | DTO cho categories | [p3-2-categories-dto.md](p3-2-categories-dto.md) |
| 3 | DTO cho brands | [p3-3-brands-dto.md](p3-3-brands-dto.md) |
| 4 | Đọc hiểu schema, vẽ ERD | [p4-1-erd.md](p4-1-erd.md) |
| 4 | Truy vấn báo cáo sản phẩm | [p4-2-report-queries.md](p4-2-report-queries.md) |
| 4 | Truy vấn tồn kho và JSON | [p4-3-inventory-queries.md](p4-3-inventory-queries.md) |
| 5 | Entity Category, chuyển sang SQL Server | [p5-1-category-entity.md](p5-1-category-entity.md) |
| 5 | Entity Brand, chuyển sang SQL Server | [p5-2-brand-entity.md](p5-2-brand-entity.md) |
| 6 | Entity Product, ProductVariant, ProductImage | [p6-1-product-entities.md](p6-1-product-entities.md) |
| 6 | API danh sách sản phẩm (lọc, sắp xếp, phân trang) | [p6-2-product-list-api.md](p6-2-product-list-api.md) |
| 6 | API chi tiết sản phẩm | [p6-3-product-detail-api.md](p6-3-product-detail-api.md) |
| 6 | Filter đổi lỗi SQL Server thành phản hồi dễ hiểu | [p6-4-sql-exception-filter.md](p6-4-sql-exception-filter.md) |
| 7 | Entity User và UsersService | [p7-1-user-entity.md](p7-1-user-entity.md) |
| 7 | Đăng ký và đăng nhập bằng JWT | [p7-2-register-login.md](p7-2-register-login.md) |
| 7 | AuthGuard toàn cục, @Public và @CurrentUser | [p7-3-auth-guard.md](p7-3-auth-guard.md) |
| 7 | Phân quyền admin: RolesGuard và @Roles | [p7-4-roles-guard.md](p7-4-roles-guard.md) |

Phần 8 trở đi: hướng dẫn chi tiết được bổ sung khi team học tới phần đó, vì code phần sau dựa trên code các bạn viết ở phần trước.
