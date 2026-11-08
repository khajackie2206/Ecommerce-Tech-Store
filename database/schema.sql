-- =============================================================================
-- TechStore database schema (Microsoft SQL Server 2022)
--
-- Run:  npm run db:schema      (or open this file in VS Code / SSMS and execute it)
-- WARNING: drops and recreates every table, so all existing data is lost.
--
-- Conventions
--   * Table names: PascalCase, plural (Products). Column names: camelCase (createdAt),
--     the same names TypeORM generates from entity properties.
--   * Catalog tables use INT IDENTITY keys (short, readable).
--     Users and Orders use UNIQUEIDENTIFIER keys so ids can't be guessed from a URL.
--   * Money: DECIMAL(18,2), never FLOAT. Text: NVARCHAR so Vietnamese is stored correctly.
--   * Timestamps are UTC (SYSUTCDATETIME()); the frontend converts to local time.
-- =============================================================================

SET NOCOUNT ON;
GO

-- Drop in reverse dependency order (children before the tables they reference)
DROP TABLE IF EXISTS OrderItems;
DROP TABLE IF EXISTS Orders;
DROP TABLE IF EXISTS ProductImages;
DROP TABLE IF EXISTS ProductVariants;
DROP TABLE IF EXISTS Products;
DROP TABLE IF EXISTS Brands;
DROP TABLE IF EXISTS Categories;
DROP TABLE IF EXISTS Users;
GO

-- -----------------------------------------------------------------------------
-- Users: customers and admins
-- -----------------------------------------------------------------------------
CREATE TABLE Users (
  id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Users_id DEFAULT NEWSEQUENTIALID(),
  email        NVARCHAR(255)    NOT NULL,
  passwordHash NVARCHAR(255)    NOT NULL, -- argon2 hash, never the plain password
  fullName     NVARCHAR(100)    NOT NULL,
  phone        VARCHAR(20)      NULL,
  role         VARCHAR(20)      NOT NULL CONSTRAINT DF_Users_role DEFAULT 'customer',
  isActive     BIT              NOT NULL CONSTRAINT DF_Users_isActive DEFAULT 1,
  createdAt    DATETIME2        NOT NULL CONSTRAINT DF_Users_createdAt DEFAULT SYSUTCDATETIME(),
  updatedAt    DATETIME2        NOT NULL CONSTRAINT DF_Users_updatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_Users PRIMARY KEY (id),
  CONSTRAINT UQ_Users_email UNIQUE (email),
  CONSTRAINT CK_Users_role CHECK (role IN ('customer', 'admin'))
);
GO

-- -----------------------------------------------------------------------------
-- Categories: Điện thoại, Laptop, Máy tính bảng, Phụ kiện
-- -----------------------------------------------------------------------------
CREATE TABLE Categories (
  id        INT IDENTITY(1,1) NOT NULL,
  name      NVARCHAR(100)     NOT NULL,
  slug      VARCHAR(120)      NOT NULL, -- URL-friendly name, e.g. dien-thoai
  sortOrder INT               NOT NULL CONSTRAINT DF_Categories_sortOrder DEFAULT 0,
  isActive  BIT               NOT NULL CONSTRAINT DF_Categories_isActive DEFAULT 1,
  createdAt DATETIME2         NOT NULL CONSTRAINT DF_Categories_createdAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_Categories PRIMARY KEY (id),
  CONSTRAINT UQ_Categories_slug UNIQUE (slug)
);
GO

-- -----------------------------------------------------------------------------
-- Brands: Apple, Samsung, Dell...
-- -----------------------------------------------------------------------------
CREATE TABLE Brands (
  id        INT IDENTITY(1,1) NOT NULL,
  name      NVARCHAR(100)     NOT NULL,
  slug      VARCHAR(120)      NOT NULL,
  logoUrl   NVARCHAR(500)     NULL,
  isActive  BIT               NOT NULL CONSTRAINT DF_Brands_isActive DEFAULT 1,
  createdAt DATETIME2         NOT NULL CONSTRAINT DF_Brands_createdAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_Brands PRIMARY KEY (id),
  CONSTRAINT UQ_Brands_slug UNIQUE (slug)
);
GO

-- -----------------------------------------------------------------------------
-- Products: one row per model, e.g. "iPhone 17 Pro Max".
-- Price and stock live in ProductVariants (one model has many color/storage options).
-- -----------------------------------------------------------------------------
CREATE TABLE Products (
  id               INT IDENTITY(1,1) NOT NULL,
  categoryId       INT               NOT NULL,
  brandId          INT               NOT NULL,
  name             NVARCHAR(200)     NOT NULL,
  slug             VARCHAR(220)      NOT NULL,
  shortDescription NVARCHAR(500)     NULL,
  description      NVARCHAR(MAX)     NULL,
  specs            NVARCHAR(MAX)     NULL, -- technical specs as JSON: {"screen": "...", "chip": "..."}
  thumbnailUrl     NVARCHAR(500)     NULL,
  isFeatured       BIT               NOT NULL CONSTRAINT DF_Products_isFeatured DEFAULT 0,
  isActive         BIT               NOT NULL CONSTRAINT DF_Products_isActive DEFAULT 1,
  createdAt        DATETIME2         NOT NULL CONSTRAINT DF_Products_createdAt DEFAULT SYSUTCDATETIME(),
  updatedAt        DATETIME2         NOT NULL CONSTRAINT DF_Products_updatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_Products PRIMARY KEY (id),
  CONSTRAINT UQ_Products_slug UNIQUE (slug),
  CONSTRAINT FK_Products_Categories FOREIGN KEY (categoryId) REFERENCES Categories(id),
  CONSTRAINT FK_Products_Brands FOREIGN KEY (brandId) REFERENCES Brands(id),
  CONSTRAINT CK_Products_specs_json CHECK (specs IS NULL OR ISJSON(specs) = 1)
);
GO

-- Speed up "products in this category / of this brand" queries
CREATE INDEX IX_Products_categoryId ON Products (categoryId);
CREATE INDEX IX_Products_brandId ON Products (brandId);
GO

-- -----------------------------------------------------------------------------
-- ProductVariants: a buyable option of a product, e.g. "256GB - Cam vũ trụ"
-- -----------------------------------------------------------------------------
CREATE TABLE ProductVariants (
  id        INT IDENTITY(1,1) NOT NULL,
  productId INT               NOT NULL,
  sku       VARCHAR(50)       NOT NULL, -- stock keeping unit, unique code per variant
  name      NVARCHAR(150)     NOT NULL,
  color     NVARCHAR(50)      NULL,
  storage   NVARCHAR(50)      NULL,     -- phones: "256GB"; laptops: "16GB/512GB" (RAM/SSD)
  price     DECIMAL(18,2)     NOT NULL, -- list price (VND)
  salePrice DECIMAL(18,2)     NULL,     -- discounted price, NULL when not on sale
  stock     INT               NOT NULL CONSTRAINT DF_ProductVariants_stock DEFAULT 0,
  isActive  BIT               NOT NULL CONSTRAINT DF_ProductVariants_isActive DEFAULT 1,
  createdAt DATETIME2         NOT NULL CONSTRAINT DF_ProductVariants_createdAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_ProductVariants PRIMARY KEY (id),
  CONSTRAINT UQ_ProductVariants_sku UNIQUE (sku),
  -- Deleting a product deletes its variants
  CONSTRAINT FK_ProductVariants_Products FOREIGN KEY (productId) REFERENCES Products(id) ON DELETE CASCADE,
  CONSTRAINT CK_ProductVariants_price CHECK (price > 0),
  CONSTRAINT CK_ProductVariants_salePrice CHECK (salePrice IS NULL OR (salePrice > 0 AND salePrice <= price)),
  CONSTRAINT CK_ProductVariants_stock CHECK (stock >= 0)
);
GO

CREATE INDEX IX_ProductVariants_productId ON ProductVariants (productId);
GO

-- -----------------------------------------------------------------------------
-- ProductImages: gallery images of a product
-- -----------------------------------------------------------------------------
CREATE TABLE ProductImages (
  id        INT IDENTITY(1,1) NOT NULL,
  productId INT               NOT NULL,
  url       NVARCHAR(500)     NOT NULL,
  sortOrder INT               NOT NULL CONSTRAINT DF_ProductImages_sortOrder DEFAULT 0,
  CONSTRAINT PK_ProductImages PRIMARY KEY (id),
  CONSTRAINT FK_ProductImages_Products FOREIGN KEY (productId) REFERENCES Products(id) ON DELETE CASCADE
);
GO

CREATE INDEX IX_ProductImages_productId ON ProductImages (productId);
GO

-- -----------------------------------------------------------------------------
-- Orders: one checkout of one user
-- -----------------------------------------------------------------------------
CREATE TABLE Orders (
  id              UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Orders_id DEFAULT NEWSEQUENTIALID(),
  code            VARCHAR(20)      NOT NULL, -- human-friendly code shown to customers, e.g. TS2611080001
  userId          UNIQUEIDENTIFIER NOT NULL,
  status          VARCHAR(20)      NOT NULL CONSTRAINT DF_Orders_status DEFAULT 'pending',
  paymentMethod   VARCHAR(20)      NOT NULL CONSTRAINT DF_Orders_paymentMethod DEFAULT 'cod',
  subtotal        DECIMAL(18,2)    NOT NULL,
  shippingFee     DECIMAL(18,2)    NOT NULL CONSTRAINT DF_Orders_shippingFee DEFAULT 0,
  total           DECIMAL(18,2)    NOT NULL,
  shippingName    NVARCHAR(100)    NOT NULL,
  shippingPhone   VARCHAR(20)      NOT NULL,
  shippingAddress NVARCHAR(500)    NOT NULL,
  note            NVARCHAR(500)    NULL,
  createdAt       DATETIME2        NOT NULL CONSTRAINT DF_Orders_createdAt DEFAULT SYSUTCDATETIME(),
  updatedAt       DATETIME2        NOT NULL CONSTRAINT DF_Orders_updatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_Orders PRIMARY KEY (id),
  CONSTRAINT UQ_Orders_code UNIQUE (code),
  CONSTRAINT FK_Orders_Users FOREIGN KEY (userId) REFERENCES Users(id),
  CONSTRAINT CK_Orders_status CHECK (status IN ('pending', 'confirmed', 'shipping', 'completed', 'cancelled')),
  CONSTRAINT CK_Orders_paymentMethod CHECK (paymentMethod IN ('cod', 'bank_transfer')),
  CONSTRAINT CK_Orders_total CHECK (total = subtotal + shippingFee)
);
GO

-- "My orders, newest first"
CREATE INDEX IX_Orders_userId_createdAt ON Orders (userId, createdAt DESC);
GO

-- -----------------------------------------------------------------------------
-- OrderItems: products inside an order.
-- productName / variantName / unitPrice are a snapshot taken at checkout, so old orders
-- stay correct even after the product is renamed or its price changes.
-- -----------------------------------------------------------------------------
CREATE TABLE OrderItems (
  id          INT IDENTITY(1,1) NOT NULL,
  orderId     UNIQUEIDENTIFIER  NOT NULL,
  variantId   INT               NOT NULL,
  productName NVARCHAR(200)     NOT NULL,
  variantName NVARCHAR(150)     NOT NULL,
  unitPrice   DECIMAL(18,2)     NOT NULL,
  quantity    INT               NOT NULL,
  CONSTRAINT PK_OrderItems PRIMARY KEY (id),
  CONSTRAINT FK_OrderItems_Orders FOREIGN KEY (orderId) REFERENCES Orders(id) ON DELETE CASCADE,
  -- No cascade: a variant that was ever ordered cannot be deleted (hide it with isActive = 0)
  CONSTRAINT FK_OrderItems_ProductVariants FOREIGN KEY (variantId) REFERENCES ProductVariants(id),
  CONSTRAINT CK_OrderItems_quantity CHECK (quantity > 0),
  CONSTRAINT CK_OrderItems_unitPrice CHECK (unitPrice > 0)
);
GO

CREATE INDEX IX_OrderItems_orderId ON OrderItems (orderId);
GO

PRINT 'Schema created.';
GO
