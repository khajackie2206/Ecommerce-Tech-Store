## Mục tiêu

Luyện `SELECT`, `JOIN`, `GROUP BY`, CTE (`WITH`) và hàm cửa sổ (`ROW_NUMBER`) bằng các báo cáo thật trên dữ liệu điện thoại/laptop. Lưu các câu truy vấn vào `docs/sql/product-reports.sql`.

**Đọc trước:** giáo trình Bài 6, mục 6.4–6.5 (CRUD, JOIN và thống kê).

## Chuẩn bị

Trong VS Code (extension SQL Server): kết nối `localhost`, tạo file `docs/sql/product-reports.sql`, chọn database **`TechStoreDb`** ở thanh trên. Gõ từng câu dưới đây vào file, bôi đen câu đó rồi bấm **Execute** (hoặc `Ctrl+Shift+E`).

**Gõ lại, đừng copy.** Trước khi chạy mỗi câu, đoán thử kết quả, rồi so sánh.

## Truy vấn 1: Số sản phẩm và phiên bản theo hãng

```sql
-- 1. Number of products and variants per brand.
--    LEFT JOIN keeps brands that have no products yet (their counts are 0).
SELECT b.name             AS brand,
       COUNT(DISTINCT p.id) AS products,
       COUNT(v.id)          AS variants
FROM Brands b
LEFT JOIN Products p        ON p.brandId = b.id
LEFT JOIN ProductVariants v ON v.productId = p.id
GROUP BY b.name
ORDER BY products DESC, b.name;
```

Kết quả: 10 dòng, Apple đứng đầu với 8 sản phẩm, 21 phiên bản.

- `LEFT JOIN` giữ **mọi** hãng kể cả hãng chưa có sản phẩm; `JOIN` thường sẽ bỏ mất chúng.
- `COUNT(DISTINCT p.id)`: sau khi JOIN, mỗi sản phẩm lặp lại theo số phiên bản của nó. `DISTINCT` để mỗi sản phẩm chỉ đếm một lần.
- `GROUP BY b.name`: gom các dòng cùng hãng thành một dòng, rồi `COUNT` đếm trong từng nhóm.

## Truy vấn 2: Giá "từ ..." của từng sản phẩm

```sql
-- 2. "From" price of every product: the cheapest variant, using the sale price when there is one.
--    COALESCE(a, b) returns a, or b when a is NULL.
SELECT p.name,
       MIN(COALESCE(v.salePrice, v.price)) AS fromPrice,
       MAX(v.price)                        AS highestListPrice
FROM Products p
JOIN ProductVariants v ON v.productId = p.id
GROUP BY p.id, p.name
ORDER BY fromPrice;
```

Kết quả: 25 dòng, rẻ nhất là củ sạc Samsung 290.000đ. Đây chính là con số "Giá từ 36.990.000đ" sẽ hiện trên thẻ sản phẩm ở trang chủ (Phần 9).

- `COALESCE(v.salePrice, v.price)`: có giá khuyến mãi thì lấy, không thì lấy giá gốc.
- `GROUP BY p.id, p.name`: nhóm theo `id` (hai sản phẩm có thể trùng tên), thêm `p.name` vì cột nào trong `SELECT` không nằm trong hàm gộp thì phải có trong `GROUP BY`.

## Truy vấn 3: Top 3 sản phẩm đắt nhất mỗi danh mục

```sql
-- 3. Top 3 most expensive products in each category.
--    The CTE (WITH ...) computes one price per product; ROW_NUMBER() then ranks them inside each category.
WITH ProductPrice AS (
  SELECT p.id, p.name, c.name AS category, MAX(v.price) AS maxPrice
  FROM Products p
  JOIN Categories c      ON c.id = p.categoryId
  JOIN ProductVariants v ON v.productId = p.id
  GROUP BY p.id, p.name, c.name
),
Ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY maxPrice DESC) AS rankInCategory
  FROM ProductPrice
)
SELECT category, rankInCategory, name, maxPrice
FROM Ranked
WHERE rankInCategory <= 3
ORDER BY category, rankInCategory;
```

Kết quả: 11 dòng (Máy tính bảng chỉ có 2 sản phẩm).

- **CTE** (`WITH Ten AS (...)`): đặt tên cho một kết quả trung gian để câu sau dùng lại, giống khai báo biến. Dễ đọc hơn nhiều so với lồng `SELECT` trong `SELECT`.
- `ROW_NUMBER() OVER (PARTITION BY category ORDER BY maxPrice DESC)`: đánh số 1, 2, 3... **riêng trong từng danh mục**, xếp theo giá giảm dần.
- Không viết thẳng `WHERE ROW_NUMBER() ... <= 3` được, vì `WHERE` chạy **trước** khi đánh số. Đó là lý do cần CTE `Ranked`.
- Để ý: iPhone 17 Pro Max và Galaxy Z Fold7 cùng giá cao nhất 50.990.000đ, nhưng `ROW_NUMBER` vẫn đánh 1 và 2. Thử đổi sang `RANK()` để thấy cả hai cùng hạng 1.

## Truy vấn 4: Phiên bản đang giảm giá, kèm % giảm

```sql
-- 4. Variants on sale, with the discount in percent (rounded to a whole number)
SELECT p.name AS product,
       v.name AS variant,
       v.price,
       v.salePrice,
       CAST(ROUND((v.price - v.salePrice) * 100.0 / v.price, 0) AS INT) AS discountPercent
FROM ProductVariants v
JOIN Products p ON p.id = v.productId
WHERE v.salePrice IS NOT NULL
ORDER BY discountPercent DESC;
```

Kết quả: 23 dòng, giảm nhiều nhất là củ sạc Samsung 26%, rồi Galaxy S25 Ultra 15%.

- `WHERE v.salePrice IS NOT NULL`: so sánh với `NULL` phải dùng `IS NULL` / `IS NOT NULL`; viết `= NULL` luôn ra rỗng.
- `* 100.0`: nhân với số thập phân để phép chia không bị làm tròn thành số nguyên quá sớm.

## Kiểm tra

- [ ] 4 câu chạy đúng, số dòng khớp với mô tả
- [ ] File `docs/sql/product-reports.sql` có đủ 4 câu và comment (tiếng Anh)
- [ ] Giải thích được cho teammate: khác nhau giữa `JOIN` và `LEFT JOIN`; vì sao cần CTE ở truy vấn 3
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Viết câu truy vấn: hãng nào có tổng tồn kho (`SUM(stock)`) lớn nhất?
2. Sửa truy vấn 2 để chỉ lấy sản phẩm thuộc danh mục Laptop (gợi ý: thêm `JOIN Categories` và `WHERE c.slug = 'laptop'`).
