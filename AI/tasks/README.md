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
| 2 | Module categories, đọc/ghi SQL Server | [p2-1-categories-module.md](p2-1-categories-module.md) |
| 2 | Module brands, đọc/ghi SQL Server | [p2-2-brands-module.md](p2-2-brands-module.md) |
| 3 | Bật ValidationPipe toàn cục | [p3-1-validation-pipe.md](p3-1-validation-pipe.md) |
| 3 | DTO cho categories | [p3-2-categories-dto.md](p3-2-categories-dto.md) |
| 3 | DTO cho brands | [p3-3-brands-dto.md](p3-3-brands-dto.md) |
| 4 | Đọc hiểu schema, vẽ ERD | [p4-1-erd.md](p4-1-erd.md) |
| 4 | Truy vấn báo cáo sản phẩm | [p4-2-report-queries.md](p4-2-report-queries.md) |
| 4 | Truy vấn tồn kho và JSON | [p4-3-inventory-queries.md](p4-3-inventory-queries.md) |
| 6 | Entity Product, ProductVariant, ProductImage | [p6-1-product-entities.md](p6-1-product-entities.md) |
| 6 | API danh sách sản phẩm (lọc, sắp xếp, phân trang) | [p6-2-product-list-api.md](p6-2-product-list-api.md) |
| 6 | API chi tiết sản phẩm | [p6-3-product-detail-api.md](p6-3-product-detail-api.md) |
| 6 | Filter đổi lỗi SQL Server thành phản hồi dễ hiểu | [p6-4-sql-exception-filter.md](p6-4-sql-exception-filter.md) |
| 7 | Entity User và UsersService | [p7-1-user-entity.md](p7-1-user-entity.md) |
| 7 | Đăng ký và đăng nhập bằng JWT | [p7-2-register-login.md](p7-2-register-login.md) |
| 7 | AuthGuard toàn cục, @Public và @CurrentUser | [p7-3-auth-guard.md](p7-3-auth-guard.md) |
| 7 | Phân quyền admin: RolesGuard và @Roles | [p7-4-roles-guard.md](p7-4-roles-guard.md) |
| 8 | Swagger cho toàn bộ API | [p8-1-swagger-docs.md](p8-1-swagger-docs.md) |
| 8 | Unit test CategoriesService và BrandsService | [p8-2-unit-test-categories-brands.md](p8-2-unit-test-categories-brands.md) |
| 8 | Unit test ProductsService và AuthService | [p8-3-unit-test-products-auth.md](p8-3-unit-test-products-auth.md) |
| 9 | Layout cửa hàng và React Router | [p9-1-layout-router.md](p9-1-layout-router.md) |
| 9 | API client chung và TanStack Query | [p9-2-api-client-query.md](p9-2-api-client-query.md) |
| 9 | Trang chủ | [p9-3-home-page.md](p9-3-home-page.md) |
| 9 | Trang danh sách sản phẩm có bộ lọc | [p9-4-product-list-page.md](p9-4-product-list-page.md) |
| 9 | Trang chi tiết sản phẩm | [p9-5-product-detail-page.md](p9-5-product-detail-page.md) |
| 10 | Trang đăng ký, đăng nhập | [p10-1-auth-pages.md](p10-1-auth-pages.md) |
| 10 | Giỏ hàng | [p10-2-cart.md](p10-2-cart.md) |
| 11 | API đặt hàng: transaction trừ tồn kho | [p11-1-orders-api.md](p11-1-orders-api.md) |
| 11 | API lịch sử đơn hàng và huỷ đơn | [p11-2-order-history-cancel.md](p11-2-order-history-cancel.md) |
| 11 | Trang thanh toán và đặt hàng thành công | [p11-3-checkout-page.md](p11-3-checkout-page.md) |
| 11 | Trang lịch sử đơn hàng | [p11-4-order-history-page.md](p11-4-order-history-page.md) |
| 12 | API admin: quản lý sản phẩm và phiên bản | [p12-1-admin-products-api.md](p12-1-admin-products-api.md) |
| 12 | Upload ảnh sản phẩm | [p12-2-upload-images.md](p12-2-upload-images.md) |
| 12 | API admin: quản lý đơn hàng | [p12-3-admin-orders-api.md](p12-3-admin-orders-api.md) |
| 12 | Giao diện admin: quản lý sản phẩm | [p12-4-admin-products-ui.md](p12-4-admin-products-ui.md) |
| 12 | Giao diện admin: quản lý đơn hàng | [p12-5-admin-orders-ui.md](p12-5-admin-orders-ui.md) |
| 13 | API báo cáo doanh thu và sản phẩm bán chạy | [p13-1-reports-api.md](p13-1-reports-api.md) |
| 13 | Dashboard admin với biểu đồ | [p13-2-dashboard.md](p13-2-dashboard.md) |
| 14 | Migration TypeORM thay cho schema.sql | [p14-1-migrations.md](p14-1-migrations.md) |

Soạn sau: CI với GitHub Actions (#43), triển khai lên server (#44).
