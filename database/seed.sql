-- =============================================================================
-- TechStore sample data: categories, brands, phones, laptops, tablets, accessories
--
-- Run after schema.sql:  npm run db:seed   (or npm run db:reset to run both)
-- WARNING: deletes all catalog and order data first. Local development only.
--
-- Prices are in VND and only illustrative; specs are simplified sample data.
-- Images use placehold.co placeholders until real product photos are uploaded.
-- =============================================================================

SET NOCOUNT ON;
-- If any statement fails, roll back the whole transaction instead of leaving half the data
SET XACT_ABORT ON;
GO

BEGIN TRANSACTION;

-- -----------------------------------------------------------------------------
-- 1. Clean up (children first) and restart identity counters at 1
-- -----------------------------------------------------------------------------
DELETE FROM OrderItems;
DELETE FROM Orders;
DELETE FROM ProductImages;
DELETE FROM ProductVariants;
DELETE FROM Products;
DELETE FROM Brands;
DELETE FROM Categories;

-- RESEED 0 makes the next id 1, but only on a table that has had rows before.
-- On a brand-new table (right after schema.sql) the next id would be 0, so skip those:
-- sys.identity_columns.last_value is NULL until the first row is inserted.
IF (SELECT last_value FROM sys.identity_columns WHERE object_id = OBJECT_ID('OrderItems')) IS NOT NULL
  DBCC CHECKIDENT ('OrderItems', RESEED, 0) WITH NO_INFOMSGS;
IF (SELECT last_value FROM sys.identity_columns WHERE object_id = OBJECT_ID('ProductImages')) IS NOT NULL
  DBCC CHECKIDENT ('ProductImages', RESEED, 0) WITH NO_INFOMSGS;
IF (SELECT last_value FROM sys.identity_columns WHERE object_id = OBJECT_ID('ProductVariants')) IS NOT NULL
  DBCC CHECKIDENT ('ProductVariants', RESEED, 0) WITH NO_INFOMSGS;
IF (SELECT last_value FROM sys.identity_columns WHERE object_id = OBJECT_ID('Products')) IS NOT NULL
  DBCC CHECKIDENT ('Products', RESEED, 0) WITH NO_INFOMSGS;
IF (SELECT last_value FROM sys.identity_columns WHERE object_id = OBJECT_ID('Brands')) IS NOT NULL
  DBCC CHECKIDENT ('Brands', RESEED, 0) WITH NO_INFOMSGS;
IF (SELECT last_value FROM sys.identity_columns WHERE object_id = OBJECT_ID('Categories')) IS NOT NULL
  DBCC CHECKIDENT ('Categories', RESEED, 0) WITH NO_INFOMSGS;

-- -----------------------------------------------------------------------------
-- 2. Categories
-- -----------------------------------------------------------------------------
INSERT INTO Categories (name, slug, sortOrder) VALUES
  (N'Điện thoại',     'dien-thoai', 1),
  (N'Laptop',         'laptop',     2),
  (N'Máy tính bảng',  'tablet',     3),
  (N'Phụ kiện',       'phu-kien',   4);

-- -----------------------------------------------------------------------------
-- 3. Brands
-- -----------------------------------------------------------------------------
INSERT INTO Brands (name, slug) VALUES
  (N'Apple',   'apple'),
  (N'Samsung', 'samsung'),
  (N'Xiaomi',  'xiaomi'),
  (N'OPPO',    'oppo'),
  (N'vivo',    'vivo'),
  (N'ASUS',    'asus'),
  (N'Dell',    'dell'),
  (N'HP',      'hp'),
  (N'Lenovo',  'lenovo'),
  (N'Acer',    'acer');

-- Placeholder logo for every brand
UPDATE Brands SET logoUrl = 'https://placehold.co/200x80?text=' + REPLACE(name, ' ', '+');

-- -----------------------------------------------------------------------------
-- 4. Products
-- Each row names its category and brand by slug; the JOINs turn slugs into ids.
-- -----------------------------------------------------------------------------
INSERT INTO Products (categoryId, brandId, name, slug, shortDescription, specs, isFeatured)
SELECT c.id, b.id, v.name, v.slug, v.shortDescription, v.specs, v.isFeatured
FROM (VALUES
  -- ===== Phones =====
  ('dien-thoai', 'apple', N'iPhone 17 Pro Max', 'iphone-17-pro-max',
   N'Màn hình lớn nhất, camera tele 5x, pin dùng cả ngày.',
   N'{"screen":"6.9 inch OLED 120Hz","chip":"Apple A19 Pro","ram":"12GB","rearCamera":"48MP + 48MP + 48MP","frontCamera":"18MP","battery":"4832 mAh","os":"iOS 26"}', 1),
  ('dien-thoai', 'apple', N'iPhone 17 Pro', 'iphone-17-pro',
   N'Thiết kế nhôm nguyên khối, chip A19 Pro mạnh mẽ.',
   N'{"screen":"6.3 inch OLED 120Hz","chip":"Apple A19 Pro","ram":"12GB","rearCamera":"48MP + 48MP + 48MP","frontCamera":"18MP","battery":"3998 mAh","os":"iOS 26"}', 1),
  ('dien-thoai', 'apple', N'iPhone 17', 'iphone-17',
   N'Màn hình 120Hz lần đầu trên bản tiêu chuẩn.',
   N'{"screen":"6.3 inch OLED 120Hz","chip":"Apple A19","ram":"8GB","rearCamera":"48MP + 48MP","frontCamera":"18MP","battery":"3692 mAh","os":"iOS 26"}', 0),
  ('dien-thoai', 'apple', N'iPhone 16', 'iphone-16',
   N'Nút Camera Control, chip A18 tiết kiệm pin.',
   N'{"screen":"6.1 inch OLED 60Hz","chip":"Apple A18","ram":"8GB","rearCamera":"48MP + 12MP","frontCamera":"12MP","battery":"3561 mAh","os":"iOS 26"}', 0),
  ('dien-thoai', 'samsung', N'Samsung Galaxy S25 Ultra', 'samsung-galaxy-s25-ultra',
   N'Bút S Pen, camera 200MP, Galaxy AI.',
   N'{"screen":"6.9 inch Dynamic AMOLED 2X 120Hz","chip":"Snapdragon 8 Elite for Galaxy","ram":"12GB","rearCamera":"200MP + 50MP + 50MP + 10MP","frontCamera":"12MP","battery":"5000 mAh","os":"Android 15"}', 1),
  ('dien-thoai', 'samsung', N'Samsung Galaxy Z Fold7', 'samsung-galaxy-z-fold7',
   N'Điện thoại gập mỏng nhẹ, màn hình trong 8 inch.',
   N'{"screen":"8.0 inch (chính) + 6.5 inch (phụ) 120Hz","chip":"Snapdragon 8 Elite for Galaxy","ram":"12GB","rearCamera":"200MP + 12MP + 10MP","frontCamera":"10MP","battery":"4400 mAh","os":"Android 16"}', 0),
  ('dien-thoai', 'samsung', N'Samsung Galaxy A56 5G', 'samsung-galaxy-a56-5g',
   N'Tầm trung bền bỉ, 6 năm cập nhật hệ điều hành.',
   N'{"screen":"6.7 inch Super AMOLED 120Hz","chip":"Exynos 1580","ram":"8GB","rearCamera":"50MP + 12MP + 5MP","frontCamera":"12MP","battery":"5000 mAh","os":"Android 15"}', 0),
  ('dien-thoai', 'xiaomi', N'Xiaomi 15T Pro', 'xiaomi-15t-pro',
   N'Camera Leica, sạc nhanh 90W.',
   N'{"screen":"6.83 inch AMOLED 144Hz","chip":"MediaTek Dimensity 9400+","ram":"12GB","rearCamera":"50MP + 50MP + 12MP","frontCamera":"32MP","battery":"5500 mAh","os":"Android 15"}', 0),
  ('dien-thoai', 'xiaomi', N'Xiaomi Redmi Note 14 Pro 5G', 'xiaomi-redmi-note-14-pro-5g',
   N'Camera 200MP, chống nước IP68 trong tầm giá.',
   N'{"screen":"6.67 inch AMOLED 120Hz","chip":"MediaTek Dimensity 7300 Ultra","ram":"8GB","rearCamera":"200MP + 8MP + 2MP","frontCamera":"20MP","battery":"5110 mAh","os":"Android 14"}', 0),
  ('dien-thoai', 'oppo', N'OPPO Reno14 5G', 'oppo-reno14-5g',
   N'Chuyên gia chân dung, thiết kế mỏng nhẹ.',
   N'{"screen":"6.59 inch AMOLED 120Hz","chip":"MediaTek Dimensity 8350","ram":"12GB","rearCamera":"50MP + 50MP + 8MP","frontCamera":"50MP","battery":"6000 mAh","os":"Android 15"}', 0),
  ('dien-thoai', 'vivo', N'vivo V50 5G', 'vivo-v50-5g',
   N'Camera ZEISS, pin 6000 mAh.',
   N'{"screen":"6.77 inch AMOLED 120Hz","chip":"Snapdragon 7 Gen 3","ram":"12GB","rearCamera":"50MP + 50MP","frontCamera":"50MP","battery":"6000 mAh","os":"Android 15"}', 0),

  -- ===== Laptops =====
  ('laptop', 'apple', N'MacBook Air 13 inch M4', 'macbook-air-13-m4',
   N'Mỏng nhẹ, pin đến 18 giờ, không quạt tản nhiệt.',
   N'{"cpu":"Apple M4 10 nhân","ram":"16GB","storage":"SSD 256GB / 512GB","screen":"13.6 inch Liquid Retina","gpu":"GPU 8 nhân","weight":"1.24 kg","os":"macOS"}', 1),
  ('laptop', 'apple', N'MacBook Pro 14 inch M5', 'macbook-pro-14-m5',
   N'Màn hình XDR, hiệu năng cho dân sáng tạo.',
   N'{"cpu":"Apple M5 10 nhân","ram":"16GB","storage":"SSD 512GB / 1TB","screen":"14.2 inch Liquid Retina XDR","gpu":"GPU 10 nhân","weight":"1.55 kg","os":"macOS"}', 0),
  ('laptop', 'asus', N'ASUS Vivobook 15', 'asus-vivobook-15',
   N'Laptop học tập, văn phòng giá tốt.',
   N'{"cpu":"Intel Core i5-13420H","ram":"16GB","storage":"SSD 512GB","screen":"15.6 inch Full HD","gpu":"Intel UHD Graphics","weight":"1.7 kg","os":"Windows 11"}', 0),
  ('laptop', 'asus', N'ASUS ROG Strix G16', 'asus-rog-strix-g16',
   N'Laptop gaming RTX 50 series, màn hình 165Hz.',
   N'{"cpu":"Intel Core i7-14650HX","ram":"16GB","storage":"SSD 1TB","screen":"16 inch QHD+ 165Hz","gpu":"NVIDIA GeForce RTX 5060 8GB","weight":"2.5 kg","os":"Windows 11"}', 1),
  ('laptop', 'dell', N'Dell Inspiron 15 3530', 'dell-inspiron-15-3530',
   N'Bền bỉ, bàn phím số tiện cho dân văn phòng.',
   N'{"cpu":"Intel Core i5-1334U","ram":"16GB","storage":"SSD 512GB","screen":"15.6 inch Full HD 120Hz","gpu":"Intel Iris Xe Graphics","weight":"1.62 kg","os":"Windows 11"}', 0),
  ('laptop', 'hp', N'HP Pavilion 15', 'hp-pavilion-15',
   N'Thiết kế thanh lịch, loa B&O.',
   N'{"cpu":"Intel Core i5-1335U","ram":"16GB","storage":"SSD 512GB","screen":"15.6 inch Full HD IPS","gpu":"Intel Iris Xe Graphics","weight":"1.74 kg","os":"Windows 11"}', 0),
  ('laptop', 'lenovo', N'Lenovo ThinkPad E14 Gen 6', 'lenovo-thinkpad-e14-gen-6',
   N'Dòng ThinkPad doanh nhân, bàn phím gõ êm.',
   N'{"cpu":"Intel Core Ultra 5 125U","ram":"16GB","storage":"SSD 512GB","screen":"14 inch WUXGA IPS","gpu":"Intel Graphics","weight":"1.44 kg","os":"Windows 11"}', 0),
  ('laptop', 'lenovo', N'Lenovo Legion 5', 'lenovo-legion-5',
   N'Gaming mạnh mẽ, tản nhiệt hiệu quả.',
   N'{"cpu":"AMD Ryzen 7 8745HX","ram":"32GB","storage":"SSD 1TB","screen":"15.1 inch 2.5K OLED 165Hz","gpu":"NVIDIA GeForce RTX 5060 8GB","weight":"1.95 kg","os":"Windows 11"}', 0),
  ('laptop', 'acer', N'Acer Nitro V 15', 'acer-nitro-v-15',
   N'Laptop gaming nhập môn giá dễ tiếp cận.',
   N'{"cpu":"Intel Core i5-13420H","ram":"16GB","storage":"SSD 512GB","screen":"15.6 inch Full HD 144Hz","gpu":"NVIDIA GeForce RTX 4050 6GB","weight":"2.1 kg","os":"Windows 11"}', 0),

  -- ===== Tablets =====
  ('tablet', 'apple', N'iPad Air 11 inch M3 Wi-Fi', 'ipad-air-11-m3-wifi',
   N'Chip M3, hỗ trợ Apple Pencil Pro.',
   N'{"screen":"11 inch Liquid Retina","chip":"Apple M3","ram":"8GB","rearCamera":"12MP","frontCamera":"12MP","battery":"Lên đến 10 giờ","os":"iPadOS 26"}', 0),
  ('tablet', 'samsung', N'Samsung Galaxy Tab S10 FE', 'samsung-galaxy-tab-s10-fe',
   N'Kèm bút S Pen, màn hình 10.9 inch.',
   N'{"screen":"10.9 inch TFT LCD 90Hz","chip":"Exynos 1580","ram":"8GB","rearCamera":"13MP","frontCamera":"12MP","battery":"8000 mAh","os":"Android 15"}', 0),

  -- ===== Accessories =====
  ('phu-kien', 'apple', N'AirPods 4', 'airpods-4',
   N'Tai nghe không dây, âm thanh không gian.',
   N'{"type":"Tai nghe True Wireless","connection":"Bluetooth 5.3","battery":"Đến 30 giờ (kèm hộp sạc)","charging":"USB-C"}', 0),
  ('phu-kien', 'samsung', N'Củ sạc nhanh Samsung 25W Type-C', 'cu-sac-samsung-25w',
   N'Sạc siêu nhanh cho điện thoại Galaxy.',
   N'{"type":"Củ sạc","power":"25W","port":"USB-C","standard":"Super Fast Charging, PD 3.0"}', 0),
  ('phu-kien', 'xiaomi', N'Pin sạc dự phòng Xiaomi 10000mAh 22.5W', 'pin-du-phong-xiaomi-10000mah',
   N'Nhỏ gọn, sạc nhanh 2 chiều 22.5W.',
   N'{"type":"Pin sạc dự phòng","capacity":"10000 mAh","power":"22.5W","ports":"USB-A, USB-C"}', 0)
) AS v (categorySlug, brandSlug, name, slug, shortDescription, specs, isFeatured)
JOIN Categories c ON c.slug = v.categorySlug
JOIN Brands b ON b.slug = v.brandSlug;

-- Placeholder thumbnail generated from the product name
UPDATE Products SET thumbnailUrl = 'https://placehold.co/600x600?text=' + REPLACE(slug, '-', '+');

-- -----------------------------------------------------------------------------
-- 5. Product images: 3 placeholder images per product (CROSS JOIN = every product x every number)
-- -----------------------------------------------------------------------------
INSERT INTO ProductImages (productId, url, sortOrder)
SELECT p.id,
       'https://placehold.co/800x800?text=' + REPLACE(p.slug, '-', '+') + '+' + CAST(n.num AS VARCHAR(2)),
       n.num
FROM Products p
CROSS JOIN (VALUES (1), (2), (3)) AS n (num);

-- -----------------------------------------------------------------------------
-- 6. Variants (color / storage options with price and stock)
-- salePrice NULL = not on sale; stock 0 = out of stock
-- -----------------------------------------------------------------------------
INSERT INTO ProductVariants (productId, sku, name, color, storage, price, salePrice, stock)
SELECT p.id, v.sku, v.name, v.color, v.storage, v.price, v.salePrice, v.stock
FROM (VALUES
  -- iPhone 17 Pro Max
  ('iphone-17-pro-max', 'IP17PM-256-ORG', N'256GB - Cam vũ trụ',  N'Cam vũ trụ',  '256GB', 37990000, 36990000, 25),
  ('iphone-17-pro-max', 'IP17PM-256-BLU', N'256GB - Xanh đậm',    N'Xanh đậm',    '256GB', 37990000, 36990000, 18),
  ('iphone-17-pro-max', 'IP17PM-512-SLV', N'512GB - Bạc',         N'Bạc',         '512GB', 44490000, NULL,     10),
  ('iphone-17-pro-max', 'IP17PM-1TB-ORG', N'1TB - Cam vũ trụ',    N'Cam vũ trụ',  '1TB',   50990000, NULL,      4),
  -- iPhone 17 Pro
  ('iphone-17-pro', 'IP17P-256-ORG', N'256GB - Cam vũ trụ', N'Cam vũ trụ', '256GB', 34990000, 33990000, 20),
  ('iphone-17-pro', 'IP17P-256-SLV', N'256GB - Bạc',        N'Bạc',        '256GB', 34990000, NULL,     15),
  ('iphone-17-pro', 'IP17P-512-BLU', N'512GB - Xanh đậm',   N'Xanh đậm',   '512GB', 40990000, NULL,      8),
  -- iPhone 17
  ('iphone-17', 'IP17-256-BLK', N'256GB - Đen',          N'Đen',          '256GB', 24990000, NULL, 30),
  ('iphone-17', 'IP17-256-LAV', N'256GB - Tím oải hương', N'Tím oải hương', '256GB', 24990000, NULL, 22),
  ('iphone-17', 'IP17-512-SAG', N'512GB - Xanh xô thơm',  N'Xanh xô thơm',  '512GB', 30990000, NULL,  0),
  -- iPhone 16
  ('iphone-16', 'IP16-128-BLK', N'128GB - Đen',     N'Đen',     '128GB', 19990000, 18490000, 40),
  ('iphone-16', 'IP16-128-PNK', N'128GB - Hồng',    N'Hồng',    '128GB', 19990000, 18490000, 12),
  ('iphone-16', 'IP16-256-TEA', N'256GB - Xanh mòng két', N'Xanh mòng két', '256GB', 22990000, 21490000, 9),
  -- Galaxy S25 Ultra
  ('samsung-galaxy-s25-ultra', 'SS-S25U-256-TBK', N'12GB/256GB - Titan Đen',  N'Titan Đen',  '12GB/256GB', 33990000, 28990000, 20),
  ('samsung-galaxy-s25-ultra', 'SS-S25U-256-TGY', N'12GB/256GB - Titan Xám',  N'Titan Xám',  '12GB/256GB', 33990000, 28990000, 14),
  ('samsung-galaxy-s25-ultra', 'SS-S25U-512-TBL', N'12GB/512GB - Titan Xanh', N'Titan Xanh', '12GB/512GB', 37990000, 32990000,  6),
  -- Galaxy Z Fold7
  ('samsung-galaxy-z-fold7', 'SS-ZF7-256-BLK', N'12GB/256GB - Đen tuyền', N'Đen tuyền', '12GB/256GB', 46990000, NULL, 7),
  ('samsung-galaxy-z-fold7', 'SS-ZF7-512-BLU', N'12GB/512GB - Xanh navy', N'Xanh navy', '12GB/512GB', 50990000, NULL, 3),
  -- Galaxy A56
  ('samsung-galaxy-a56-5g', 'SS-A56-128-GRY', N'8GB/128GB - Xám',  N'Xám',  '8GB/128GB', 9990000,  9490000, 50),
  ('samsung-galaxy-a56-5g', 'SS-A56-256-PNK', N'8GB/256GB - Hồng', N'Hồng', '8GB/256GB', 10990000, NULL,    35),
  -- Xiaomi 15T Pro
  ('xiaomi-15t-pro', 'XM-15TP-512-BLK', N'12GB/512GB - Đen',   N'Đen',   '12GB/512GB', 19490000, NULL, 16),
  ('xiaomi-15t-pro', 'XM-15TP-512-GLD', N'12GB/512GB - Vàng',  N'Vàng',  '12GB/512GB', 19490000, NULL, 11),
  -- Redmi Note 14 Pro 5G
  ('xiaomi-redmi-note-14-pro-5g', 'XM-RN14P-256-BLK', N'8GB/256GB - Đen',   N'Đen',   '8GB/256GB', 8490000, 7990000, 45),
  ('xiaomi-redmi-note-14-pro-5g', 'XM-RN14P-256-PUR', N'8GB/256GB - Tím',   N'Tím',   '8GB/256GB', 8490000, 7990000, 28),
  -- OPPO Reno14
  ('oppo-reno14-5g', 'OP-RN14-256-WHT', N'12GB/256GB - Trắng ngọc trai', N'Trắng ngọc trai', '12GB/256GB', 15990000, NULL, 19),
  ('oppo-reno14-5g', 'OP-RN14-512-GRN', N'12GB/512GB - Xanh lục',        N'Xanh lục',        '12GB/512GB', 17990000, NULL,  9),
  -- vivo V50
  ('vivo-v50-5g', 'VV-V50-256-BLU', N'12GB/256GB - Xanh dương', N'Xanh dương', '12GB/256GB', 13990000, 12990000, 21),
  ('vivo-v50-5g', 'VV-V50-512-PNK', N'12GB/512GB - Hồng',       N'Hồng',       '12GB/512GB', 15490000, NULL,      0),

  -- MacBook Air M4
  ('macbook-air-13-m4', 'MBA13-M4-16-256-SKY', N'16GB/256GB - Xanh da trời', N'Xanh da trời', '16GB/256GB', 26990000, 24990000, 15),
  ('macbook-air-13-m4', 'MBA13-M4-16-256-MID', N'16GB/256GB - Đen bóng đêm', N'Đen bóng đêm', '16GB/256GB', 26990000, 24990000, 12),
  ('macbook-air-13-m4', 'MBA13-M4-16-512-SLV', N'16GB/512GB - Bạc',          N'Bạc',          '16GB/512GB', 31990000, NULL,      8),
  -- MacBook Pro 14 M5
  ('macbook-pro-14-m5', 'MBP14-M5-16-512-SBK', N'16GB/512GB - Đen không gian', N'Đen không gian', '16GB/512GB', 42990000, NULL, 6),
  ('macbook-pro-14-m5', 'MBP14-M5-16-1TB-SLV', N'16GB/1TB - Bạc',              N'Bạc',            '16GB/1TB',   47990000, NULL, 3),
  -- ASUS Vivobook 15
  ('asus-vivobook-15', 'AS-VB15-16-512-SLV', N'16GB/512GB - Bạc', N'Bạc', '16GB/512GB', 15490000, 13990000, 25),
  -- ASUS ROG Strix G16
  ('asus-rog-strix-g16', 'AS-G16-16-1TB-GRY', N'16GB/1TB - Xám Eclipse', N'Xám Eclipse', '16GB/1TB', 42990000, 39990000, 5),
  -- Dell Inspiron 15
  ('dell-inspiron-15-3530', 'DL-INS15-16-512-BLK', N'16GB/512GB - Đen', N'Đen', '16GB/512GB', 16490000, NULL, 18),
  -- HP Pavilion 15
  ('hp-pavilion-15', 'HP-PAV15-16-512-SLV', N'16GB/512GB - Bạc', N'Bạc', '16GB/512GB', 17990000, 16490000, 14),
  -- ThinkPad E14
  ('lenovo-thinkpad-e14-gen-6', 'LN-E14G6-16-512-BLK', N'16GB/512GB - Đen', N'Đen', '16GB/512GB', 21990000, NULL, 10),
  -- Legion 5
  ('lenovo-legion-5', 'LN-LGN5-32-1TB-GRY', N'32GB/1TB - Xám', N'Xám', '32GB/1TB', 45990000, NULL, 4),
  -- Acer Nitro V 15
  ('acer-nitro-v-15', 'AC-NV15-16-512-BLK', N'16GB/512GB - Đen', N'Đen', '16GB/512GB', 22990000, 20990000, 9),

  -- iPad Air M3
  ('ipad-air-11-m3-wifi', 'IPA11-M3-128-BLU', N'128GB - Xanh dương', N'Xanh dương', '128GB', 16990000, NULL, 17),
  ('ipad-air-11-m3-wifi', 'IPA11-M3-256-PUR', N'256GB - Tím',        N'Tím',        '256GB', 19990000, NULL,  9),
  -- Galaxy Tab S10 FE
  ('samsung-galaxy-tab-s10-fe', 'SS-TABS10FE-128-GRY', N'8GB/128GB - Xám', N'Xám', '8GB/128GB', 10990000, 9990000, 20),

  -- Accessories
  ('airpods-4',                    'AP-AIRPODS4-WHT',  N'Trắng', N'Trắng', NULL, 3490000, 3190000, 60),
  ('cu-sac-samsung-25w',           'SS-TA25W-WHT',     N'Trắng', N'Trắng', NULL,  390000,  290000, 120),
  ('pin-du-phong-xiaomi-10000mah', 'XM-PB10K-BLK',     N'Đen',   N'Đen',   NULL,  490000,  420000, 80)
) AS v (productSlug, sku, name, color, storage, price, salePrice, stock)
JOIN Products p ON p.slug = v.productSlug;

COMMIT TRANSACTION;
GO

-- -----------------------------------------------------------------------------
-- Summary
-- -----------------------------------------------------------------------------
SELECT c.name AS category, COUNT(DISTINCT p.id) AS products, COUNT(pv.id) AS variants
FROM Categories c
LEFT JOIN Products p ON p.categoryId = c.id
LEFT JOIN ProductVariants pv ON pv.productId = p.id
GROUP BY c.name, c.sortOrder
ORDER BY c.sortOrder;
GO
