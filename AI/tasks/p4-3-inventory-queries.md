## Mục tiêu

Luyện `WHERE`, `BETWEEN`, `SUM`, đọc dữ liệu JSON bằng `JSON_VALUE`, và phân trang `OFFSET ... FETCH` (cách TypeORM phân trang trên SQL Server). Lưu các câu truy vấn vào `docs/sql/inventory.sql`.

**Đọc trước:** giáo trình Bài 6, mục 6.4 (phân trang) và 6.5.

## Chuẩn bị

Trong VS Code (extension SQL Server): kết nối `localhost`, tạo file `docs/sql/inventory.sql`, chọn database **`TechStoreDb`** ở thanh trên. Gõ từng câu, bôi đen rồi **Execute**. Đoán kết quả trước khi chạy.

## Truy vấn 1 và 2: Hết hàng và sắp hết

```sql
-- 1. Out-of-stock variants
SELECT p.name AS product, v.name AS variant, v.sku
FROM ProductVariants v
JOIN Products p ON p.id = v.productId
WHERE v.stock = 0;

-- 2. Running low: fewer than 5 units left (but not zero)
SELECT p.name AS product, v.name AS variant, v.stock
FROM ProductVariants v
JOIN Products p ON p.id = v.productId
WHERE v.stock BETWEEN 1 AND 4
ORDER BY v.stock;
```

Kết quả: 2 phiên bản hết hàng (iPhone 17 512GB, vivo V50 512GB) và 4 phiên bản sắp hết.

- `BETWEEN 1 AND 4` **bao gồm** cả 1 và 4, tương đương `stock >= 1 AND stock <= 4`.
- Đây là dữ liệu cho trang quản trị (Phần 12): cảnh báo admin nhập thêm hàng.

## Truy vấn 3: Giá trị tồn kho theo danh mục

```sql
-- 3. Stock value per category: units x selling price
SELECT c.name AS category,
       SUM(v.stock)                                   AS units,
       SUM(v.stock * COALESCE(v.salePrice, v.price))  AS stockValue
FROM ProductVariants v
JOIN Products p   ON p.id = v.productId
JOIN Categories c ON c.id = p.categoryId
GROUP BY c.name
ORDER BY stockValue DESC;
```

Kết quả: Điện thoại dẫn đầu với 497 máy, khoảng 10,6 tỷ đồng.

- `SUM(v.stock * ...)`: tính giá trị từng dòng trước, rồi mới cộng lại theo nhóm.
- Tiền là `DECIMAL(18,2)` nên phép nhân và cộng chính xác tuyệt đối, không sai số như `FLOAT`.

## Truy vấn 4 và 5: Đọc thông số JSON

Cột `Products.specs` lưu thông số kỹ thuật dạng JSON, ví dụ:

```json
{"screen":"6.9 inch OLED 120Hz","chip":"Apple A19 Pro","ram":"12GB","battery":"4832 mAh","os":"iOS 26"}
```

```sql
-- 4. Read fields out of the JSON specs column
SELECT name,
       JSON_VALUE(specs, '$.chip')    AS chip,
       JSON_VALUE(specs, '$.screen')  AS screen,
       JSON_VALUE(specs, '$.battery') AS battery
FROM Products
WHERE categoryId = (SELECT id FROM Categories WHERE slug = 'dien-thoai');

-- 5. Filter by a JSON field: phones with a Snapdragon chip, laptops with an RTX graphics card
SELECT name, JSON_VALUE(specs, '$.chip') AS chip
FROM Products
WHERE JSON_VALUE(specs, '$.chip') LIKE N'%Snapdragon%';

SELECT name, JSON_VALUE(specs, '$.gpu') AS gpu
FROM Products
WHERE JSON_VALUE(specs, '$.gpu') LIKE N'%RTX%';
```

Kết quả: 11 điện thoại kèm chip/màn hình/pin; 3 máy dùng Snapdragon; 3 laptop có card RTX.

- `JSON_VALUE(cot, '$.chip')`: lấy giá trị của khoá `chip`. `$` là gốc của JSON.
- Khoá không tồn tại thì ra `NULL` (điện thoại không có `gpu`, laptop không có `chip`).
- `WHERE categoryId = (SELECT id ...)`: **truy vấn con**, tìm `id` của danh mục theo slug thay vì nhớ số.
- Vì sao lưu thông số bằng JSON? Điện thoại và laptop có thông số khác nhau hoàn toàn (camera vs card đồ hoạ). Một cột JSON chứa được mọi loại, không phải tạo hàng chục cột mà phần lớn bỏ trống.

## Truy vấn 6: Phân trang

```sql
-- 6. Pagination: page 2 with 5 products per page (skip 5, take 5).
--    OFFSET ... FETCH requires ORDER BY. This is the SQL TypeORM generates for skip/take.
DECLARE @page INT = 2, @pageSize INT = 5;
SELECT id, name
FROM Products
ORDER BY name
OFFSET (@page - 1) * @pageSize ROWS FETCH NEXT @pageSize ROWS ONLY;
```

Kết quả: 5 sản phẩm thứ 6 đến 10 theo tên A→Z (bắt đầu từ "Dell Inspiron 15 3530").

- `DECLARE @page INT = 2`: khai báo biến trong T-SQL. Đổi `@page` thành 1, 3, 5 để xem các trang khác; trang 6 sẽ rỗng vì chỉ có 25 sản phẩm.
- `OFFSET n ROWS FETCH NEXT m ROWS ONLY`: bỏ qua `n` dòng, lấy `m` dòng. **Bắt buộc có `ORDER BY`**, nếu không thứ tự không xác định và trang sau có thể lặp dòng của trang trước.
- Phần 6, API danh sách sản phẩm dùng `skip` và `take` của TypeORM; TypeORM sinh ra đúng câu SQL này.

## Kiểm tra

- [ ] 6 câu chạy đúng, kết quả khớp với mô tả
- [ ] File `docs/sql/inventory.sql` có đủ các câu và comment (tiếng Anh)
- [ ] Giải thích được: `JSON_VALUE` trả gì khi khoá không tồn tại; vì sao phân trang cần `ORDER BY`
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Liệt kê laptop có `ram` là `16GB` (gợi ý: `JSON_VALUE(specs, '$.ram') = '16GB'`).
2. Viết câu đếm tổng số trang khi mỗi trang 12 sản phẩm (gợi ý: `CEILING(COUNT(*) / 12.0)`).
