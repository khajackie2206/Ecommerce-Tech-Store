-- Inventory and JSON specs (Part 4, task: Truy vấn tồn kho và thông số JSON)
-- Run in VS Code (SQL Server extension) against the TechStoreDb database.

-- =============================================================================
-- Truy vấn 1 và 2: Hết hàng và sắp hết
-- =============================================================================
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

-- =============================================================================
-- Truy vấn 3: Giá trị tồn kho theo danh mục
-- =============================================================================
-- 3. Stock value per category: units x selling price
SELECT c.name AS category,
       SUM(v.stock)                                   AS units,
       SUM(v.stock * COALESCE(v.salePrice, v.price))  AS stockValue
FROM ProductVariants v
JOIN Products p   ON p.id = v.productId
JOIN Categories c ON c.id = p.categoryId
GROUP BY c.name
ORDER BY stockValue DESC;

-- =============================================================================
-- Truy vấn 4 và 5: Đọc thông số JSON
-- =============================================================================
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

-- =============================================================================
-- Truy vấn 6: Phân trang
-- =============================================================================
-- 6. Pagination: page 2 with 5 products per page (skip 5, take 5).
--    OFFSET ... FETCH requires ORDER BY. This is the SQL TypeORM generates for skip/take.
DECLARE @page INT = 2, @pageSize INT = 5;
SELECT id, name
FROM Products
ORDER BY name
OFFSET (@page - 1) * @pageSize ROWS FETCH NEXT @pageSize ROWS ONLY;
