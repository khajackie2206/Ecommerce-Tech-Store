-- Product reports (Part 4, task: Truy vấn báo cáo sản phẩm theo hãng và danh mục)
-- Run in VS Code (SQL Server extension) against the TechStoreDb database.

-- =============================================================================
-- Truy vấn 1: Số sản phẩm và phiên bản theo hãng
-- =============================================================================
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

-- =============================================================================
-- Truy vấn 2: Giá "từ ..." của từng sản phẩm
-- =============================================================================
-- 2. "From" price of every product: the cheapest variant, using the sale price when there is one.
--    COALESCE(a, b) returns a, or b when a is NULL.
SELECT p.name,
       MIN(COALESCE(v.salePrice, v.price)) AS fromPrice,
       MAX(v.price)                        AS highestListPrice
FROM Products p
JOIN ProductVariants v ON v.productId = p.id
GROUP BY p.id, p.name
ORDER BY fromPrice;

-- =============================================================================
-- Truy vấn 3: Top 3 sản phẩm đắt nhất mỗi danh mục
-- =============================================================================
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

-- =============================================================================
-- Truy vấn 4: Phiên bản đang giảm giá, kèm % giảm
-- =============================================================================
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
