## Mục tiêu

Hiểu cấu trúc 8 bảng của TechStore trong `database/schema.sql`: khoá chính, khoá ngoại, ràng buộc `CHECK`/`UNIQUE`, và vì sao thiết kế như vậy. Vẽ sơ đồ quan hệ (ERD) lưu vào repo.

**Đọc trước:** giáo trình Bài 6 (SQL Server cơ bản).

## Bước 1: Đọc schema.sql theo thứ tự

Mở `database/schema.sql`, đọc từng bảng và trả lời các câu hỏi trong bảng dưới (ghi câu trả lời vào Pull Request):

| Bảng | Câu hỏi |
|---|---|
| `Categories`, `Brands` | Vì sao có cột `slug` và nó phải `UNIQUE`? |
| `Products` | Cột `specs` lưu gì? Ràng buộc `CK_Products_specs_json` chặn điều gì? |
| `ProductVariants` | Vì sao giá và tồn kho nằm ở đây chứ không ở `Products`? `CK_ProductVariants_salePrice` cho phép những giá trị nào? |
| `ProductImages` | `ON DELETE CASCADE` nghĩa là gì khi xoá một sản phẩm? |
| `Users`, `Orders` | Vì sao dùng `UNIQUEIDENTIFIER` mà không dùng `INT IDENTITY` như các bảng sản phẩm? |
| `OrderItems` | Vì sao lưu lại `productName`, `unitPrice` dù đã có `variantId`? Vì sao khoá ngoại tới `ProductVariants` **không** có `CASCADE`? |

Gợi ý: đọc phần comment đầu file và comment trên từng bảng.

## Bước 2: Vẽ ERD

Chọn một trong hai cách.

**Cách A: dbdiagram.io (trình duyệt, dễ nhất).** Vào https://dbdiagram.io/d, xoá nội dung mẫu, dán đoạn DBML dưới đây. Sơ đồ tự hiện bên phải; kéo các bảng cho gọn rồi **Export → PNG**.

```dbml
Table Users {
  id uniqueidentifier [pk]
  email nvarchar(255) [unique, not null]
  passwordHash nvarchar(255) [not null]
  fullName nvarchar(100) [not null]
  phone varchar(20)
  role varchar(20) [not null, note: 'customer | admin']
  isActive bit [not null]
  createdAt datetime2 [not null]
  updatedAt datetime2 [not null]
}

Table Categories {
  id int [pk, increment]
  name nvarchar(100) [not null]
  slug varchar(120) [unique, not null]
  sortOrder int [not null]
  isActive bit [not null]
  createdAt datetime2 [not null]
}

Table Brands {
  id int [pk, increment]
  name nvarchar(100) [not null]
  slug varchar(120) [unique, not null]
  logoUrl nvarchar(500)
  isActive bit [not null]
  createdAt datetime2 [not null]
}

Table Products {
  id int [pk, increment]
  categoryId int [not null, ref: > Categories.id]
  brandId int [not null, ref: > Brands.id]
  name nvarchar(200) [not null]
  slug varchar(220) [unique, not null]
  shortDescription nvarchar(500)
  description nvarchar(max)
  specs nvarchar(max) [note: 'JSON']
  thumbnailUrl nvarchar(500)
  isFeatured bit [not null]
  isActive bit [not null]
  createdAt datetime2 [not null]
  updatedAt datetime2 [not null]
}

Table ProductVariants {
  id int [pk, increment]
  productId int [not null, ref: > Products.id]
  sku varchar(50) [unique, not null]
  name nvarchar(150) [not null]
  color nvarchar(50)
  storage nvarchar(50)
  price decimal(18,2) [not null]
  salePrice decimal(18,2)
  stock int [not null]
  isActive bit [not null]
  createdAt datetime2 [not null]
}

Table ProductImages {
  id int [pk, increment]
  productId int [not null, ref: > Products.id]
  url nvarchar(500) [not null]
  sortOrder int [not null]
}

Table Orders {
  id uniqueidentifier [pk]
  code varchar(20) [unique, not null]
  userId uniqueidentifier [not null, ref: > Users.id]
  status varchar(20) [not null, note: 'pending | confirmed | shipping | completed | cancelled']
  paymentMethod varchar(20) [not null]
  subtotal decimal(18,2) [not null]
  shippingFee decimal(18,2) [not null]
  total decimal(18,2) [not null]
  shippingName nvarchar(100) [not null]
  shippingPhone varchar(20) [not null]
  shippingAddress nvarchar(500) [not null]
  note nvarchar(500)
  createdAt datetime2 [not null]
  updatedAt datetime2 [not null]
}

Table OrderItems {
  id int [pk, increment]
  orderId uniqueidentifier [not null, ref: > Orders.id]
  variantId int [not null, ref: > ProductVariants.id]
  productName nvarchar(200) [not null]
  variantName nvarchar(150) [not null]
  unitPrice decimal(18,2) [not null]
  quantity int [not null]
}
```

`ref: > Categories.id` nghĩa là quan hệ **nhiều – một**: nhiều sản phẩm thuộc một danh mục.

**Cách B: SSMS (Windows).** Kết nối `localhost`, mở `TechStoreDb` → chuột phải **Database Diagrams** → **New Database Diagram** → chọn cả 8 bảng → **Add**. SSMS tự vẽ đường nối theo khoá ngoại.

Lưu ảnh vào `docs/erd.png` và (nếu dùng cách A) lưu đoạn DBML vào `docs/erd.dbml`.

## Bước 3: Thử phá ràng buộc

Mở một query mới trong VS Code (extension SQL Server), chọn database **`TechStoreDb`** ở thanh trên, dán và chạy:

```sql
-- Try to break the rules: every statement below must fail.
-- Wrapped in a transaction that is always rolled back, so the data is never changed.
SET NOCOUNT ON;
BEGIN TRANSACTION;

BEGIN TRY
  INSERT INTO Categories (name, slug) VALUES (N'Laptop 2', 'laptop'); -- slug already exists
END TRY
BEGIN CATCH
  SELECT 'Duplicate slug' AS test, ERROR_NUMBER() AS errorNumber, ERROR_MESSAGE() AS message;
END CATCH;

BEGIN TRY
  UPDATE ProductVariants SET salePrice = price + 1 WHERE sku = 'IP16-128-BLK'; -- sale price above list price
END TRY
BEGIN CATCH
  SELECT 'Sale price > price' AS test, ERROR_NUMBER() AS errorNumber, ERROR_MESSAGE() AS message;
END CATCH;

BEGIN TRY
  DELETE FROM Brands WHERE slug = 'apple'; -- Apple still has products
END TRY
BEGIN CATCH
  SELECT 'Delete brand in use' AS test, ERROR_NUMBER() AS errorNumber, ERROR_MESSAGE() AS message;
END CATCH;

ROLLBACK TRANSACTION;
```

Kết quả mong đợi:

| Thử | Mã lỗi | Ràng buộc chặn lại |
|---|---|---|
| Trùng slug | **2627** | `UQ_Categories_slug` |
| Giá khuyến mãi > giá gốc | **547** | `CK_ProductVariants_salePrice` |
| Xoá hãng đang có sản phẩm | **547** | `FK_Products_Brands` |

Ghi nhớ: **547 dùng chung** cho vi phạm `CHECK` và vi phạm khoá ngoại; phải đọc tên ràng buộc trong thông báo mới biết loại nào. Task "Exception filter cho lỗi SQL Server" ở Phần 6 sẽ dùng các mã này.

`BEGIN TRY ... END TRY BEGIN CATCH ... END CATCH`: giống `try/catch` của JavaScript. `ROLLBACK` ở cuối huỷ mọi thay đổi, nên chạy bao nhiêu lần cũng không hỏng dữ liệu.

## Kiểm tra

- [ ] Trả lời được các câu hỏi ở Bước 1 (ghi trong Pull Request)
- [ ] Có `docs/erd.png` trong repo
- [ ] Chạy Bước 3 ra đúng 3 mã lỗi như bảng
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review
