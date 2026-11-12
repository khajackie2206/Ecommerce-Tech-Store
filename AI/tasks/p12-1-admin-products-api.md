## Mục tiêu

API cho admin quản lý sản phẩm và phiên bản. Mọi route đều `@Roles('admin')`: khách nhận 403.

| Method | URL | Việc |
|---|---|---|
| GET | `/api/v1/admin/products?q=&categoryId=&page=&limit=` | Danh sách, **kể cả sản phẩm đang ẩn** |
| GET | `/api/v1/admin/products/:id` | Chi tiết, kể cả phiên bản đang ẩn |
| POST | `/api/v1/admin/products` | Tạo sản phẩm **cùng** các phiên bản |
| PATCH | `/api/v1/admin/products/:id` | Sửa thông tin, ẩn/hiện (`isActive`), nổi bật (`isFeatured`) |
| DELETE | `/api/v1/admin/products/:id` | Xoá hẳn sản phẩm **chưa từng được bán** |
| POST | `/api/v1/admin/products/:id/variants` | Thêm phiên bản |
| PATCH | `/api/v1/admin/variants/:id` | Sửa giá, khuyến mãi, tồn kho, ẩn/hiện phiên bản |
| DELETE | `/api/v1/admin/variants/:id` | Xoá phiên bản chưa từng được bán |

Lỗi cần trả đúng: giá khuyến mãi lớn hơn giá gốc → 400; slug/SKU trùng → 409; danh mục/hãng không tồn tại → 400; xoá thứ đã có trong đơn hàng → 409.

**Làm sau:** Phần 7 (phân quyền), Phần 11 task "API lịch sử đơn hàng và huỷ đơn" (dùng `PaginationQueryDto` trong `src/common/dto`).

**Đọc trước:** task "Exception filter cho lỗi SQL Server" (Phần 6): task này dựa vào nó cho lỗi khoá ngoại.

## "Xoá" sản phẩm đã bán là ẩn nó đi

Bảng `OrderItems` trỏ tới `ProductVariants` bằng khoá ngoại **không** có `ON DELETE CASCADE` (xem `schema.sql`). Xoá một phiên bản đã từng được đặt mua thì SQL Server từ chối (lỗi 547), vì đơn hàng cũ vẫn cần biết mình đã bán phiên bản nào. Cách làm đúng là **ẩn**: `isActive = false`. Sản phẩm biến mất khỏi cửa hàng (Phần 6 đã lọc `isActive = 1`), nhưng lịch sử và báo cáo vẫn đủ.

Ta **không** tự kiểm tra "đã có đơn hàng chưa" trước khi xoá: cứ để SQL Server từ chối, filter của Phần 6 đổi lỗi 547 thành **409 "Không thể xoá vì dữ liệu đang được sử dụng"**. Cùng cách đó, `categoryId` không tồn tại → lỗi khoá ngoại → **400 "Dữ liệu liên quan không tồn tại"**, không cần câu `SELECT` kiểm tra nào.

## Bước 1: DTO

Tạo `src/products/dto/create-product.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// One buyable option of a product: "256GB - Đen", with its own price and stock
export class CreateVariantDto {
  @ApiProperty({ example: 'GP10-128-BLK' })
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'SKU chỉ gồm chữ in hoa, số và dấu gạch ngang',
  })
  @MaxLength(50, { message: 'SKU tối đa 50 ký tự' })
  sku: string;

  @ApiProperty({ example: '128GB - Đen' })
  @IsString({ message: 'Tên phiên bản phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên phiên bản không được để trống' })
  @MaxLength(150, { message: 'Tên phiên bản tối đa 150 ký tự' })
  name: string;

  @ApiProperty({ required: false, example: 'Đen' })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Màu tối đa 50 ký tự' })
  color?: string;

  @ApiProperty({ required: false, example: '128GB' })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Dung lượng tối đa 50 ký tự' })
  storage?: string;

  @ApiProperty({ example: 18990000 })
  @IsInt({ message: 'Giá phải là số nguyên (VND)' })
  @Min(1000, { message: 'Giá tối thiểu 1.000đ' })
  price: number;

  // Must be <= price: checked in the service (a rule across two fields)
  @ApiProperty({ required: false, example: 17990000 })
  @IsOptional()
  @IsInt({ message: 'Giá khuyến mãi phải là số nguyên (VND)' })
  @Min(1000, { message: 'Giá khuyến mãi tối thiểu 1.000đ' })
  salePrice?: number | null;

  @ApiProperty({ example: 20 })
  @IsInt({ message: 'Tồn kho phải là số nguyên' })
  @Min(0, { message: 'Tồn kho không được âm' })
  stock: number;

  @IsOptional()
  @IsBoolean({ message: 'isActive phải là true hoặc false' })
  isActive?: boolean;
}

// Body of POST /api/v1/admin/products: the product and at least one variant, in one go
export class CreateProductDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'categoryId phải là số nguyên' })
  categoryId: number;

  @ApiProperty({ example: 1 })
  @IsInt({ message: 'brandId phải là số nguyên' })
  brandId: number;

  @ApiProperty({ example: 'Google Pixel 10' })
  @IsString({ message: 'Tên sản phẩm phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên sản phẩm không được để trống' })
  @MaxLength(200, { message: 'Tên sản phẩm tối đa 200 ký tự' })
  name: string;

  @ApiProperty({ example: 'google-pixel-10' })
  @Matches(SLUG, {
    message: 'Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang',
  })
  @MaxLength(220, { message: 'Slug tối đa 220 ký tự' })
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Mô tả ngắn tối đa 500 ký tự' })
  shortDescription?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Free-form technical specs, stored as JSON text (Products.specs)
  @ApiProperty({
    required: false,
    example: { chip: 'Google Tensor G5', ram: '12GB', screen: '6.3 inch OLED' },
  })
  @IsOptional()
  @IsObject({ message: 'specs phải là một object' })
  specs?: Record<string, string>;

  // A full URL (seed images: https://placehold.co/...) or an image uploaded to this
  // server (/uploads/products/<file>, see the upload task). @IsUrl would refuse the
  // second form: it is a path, not a full URL.
  @IsOptional()
  @Matches(/^(https?:\/\/\S+|\/uploads\/\S+)$/, {
    message:
      'thumbnailUrl phải là URL http(s) hoặc ảnh đã upload (/uploads/...)',
  })
  @MaxLength(500)
  thumbnailUrl?: string;

  @IsOptional()
  @IsBoolean({ message: 'isFeatured phải là true hoặc false' })
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'isActive phải là true hoặc false' })
  isActive?: boolean;

  @ArrayMinSize(1, { message: 'Sản phẩm cần ít nhất một phiên bản' })
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants: CreateVariantDto[];
}
```

Tạo `src/products/dto/update-product.dto.ts`:

```ts
import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto.js';

// PATCH /api/v1/admin/products/:id: any product field, but NOT the variants
// (they have their own routes). OmitType removes a field, PartialType makes the rest optional.
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['variants'] as const),
) {}
```

Tạo `src/products/dto/update-variant.dto.ts`:

```ts
import { PartialType } from '@nestjs/swagger';
import { CreateVariantDto } from './create-product.dto.js';

// PATCH /api/v1/admin/variants/:id: change price, stock, hide... one field at a time
export class UpdateVariantDto extends PartialType(CreateVariantDto) {}
```

Tạo `src/products/dto/list-admin-products-query.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

// GET /api/v1/admin/products?q=&categoryId=&page=&limit=
export class ListAdminProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên hoặc slug' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;
}
```

Giải thích:
- `OmitType(CreateProductDto, ['variants'])` bỏ field `variants`, `PartialType(...)` biến phần còn lại thành không bắt buộc. Cả hai lấy từ `@nestjs/swagger` để Swagger hiện đúng.
- Giá dùng `@IsInt`: tiền Việt không có phần lẻ. Cột vẫn là `DECIMAL(18,2)` như Phần 4.
- `specs` là object tuỳ ý (`{ "chip": "...", "ram": "..." }`), kiểm tra bằng `@IsObject`. `jsonTransformer` (Phần 6) đổi nó thành chuỗi JSON khi lưu.
- "Giá khuyến mãi ≤ giá gốc" liên quan **hai** field nên không viết bằng decorator đơn lẻ được: service kiểm tra.
- `ListAdminProductsQueryDto extends PaginationQueryDto`: kế thừa `page`, `limit` và quy tắc của chúng.

## Bước 2: Cho phép lưu sản phẩm cùng phiên bản

Trong `src/products/entities/product.entity.ts`, thêm `cascade: ['insert']` vào quan hệ `variants`:

```ts
  // cascade insert: saving a new Product with variants inserts the variants too (admin)
  @OneToMany(() => ProductVariant, (variant) => variant.product, {
    cascade: ['insert'],
  })
  variants: Relation<ProductVariant[]>;
```

## Bước 3: Service

Tạo `src/products/admin-products.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository, type FindOptionsWhere } from 'typeorm';
import type { Paginated } from '../common/dto/pagination-query.dto.js';
import type {
  CreateProductDto,
  CreateVariantDto,
} from './dto/create-product.dto.js';
import type { ListAdminProductsQueryDto } from './dto/list-admin-products-query.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';
import type { UpdateVariantDto } from './dto/update-variant.dto.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { Product } from './entities/product.entity.js';

// Admin side of the catalog. Unlike ProductsService (the shop), it also sees
// hidden products and hidden variants.
@Injectable()
export class AdminProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
  ) {}

  async findAll(query: ListAdminProductsQueryDto): Promise<Paginated<Product>> {
    const { page, limit, q, categoryId } = query;
    const base: FindOptionsWhere<Product> = categoryId ? { categoryId } : {};
    // Array in `where` = OR: name LIKE ... OR slug LIKE ...
    const where = q
      ? [
          { ...base, name: Like(`%${q}%`) },
          { ...base, slug: Like(`%${q}%`) },
        ]
      : base;

    const [items, total] = await this.productsRepo.findAndCount({
      where,
      relations: { category: true, brand: true, variants: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.productsRepo.findOne({
      where: { id },
      relations: { category: true, brand: true, variants: true, images: true },
      order: { variants: { id: 'ASC' }, images: { sortOrder: 'ASC' } },
    });
    if (!product)
      throw new NotFoundException(`Không tìm thấy sản phẩm id=${id}`);
    return product;
  }

  // Product + its variants in one save(). save() wraps the inserts in a transaction
  // by itself: if one variant fails (duplicate SKU...), the product is not created either.
  async create(dto: CreateProductDto): Promise<Product> {
    await this.ensureSlugIsFree(dto.slug);
    for (const variant of dto.variants) {
      this.ensureSalePriceIsValid(variant.price, variant.salePrice);
      await this.ensureSkuIsFree(variant.sku);
    }
    const product = this.productsRepo.create(dto); // variants: cascade insert
    const saved = await this.productsRepo.save(product);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateProductDto): Promise<Product> {
    await this.findOne(id); // 404 for an unknown product
    if (dto.slug !== undefined) await this.ensureSlugIsFree(dto.slug, id);
    // UPDATE Products SET <only the sent columns> WHERE id = @0
    await this.productsRepo.update({ id }, dto);
    return this.findOne(id); // read it back: updatedAt, relations
  }

  // Real DELETE. A product that was ever ordered can't be deleted:
  // FK_OrderItems_ProductVariants blocks it (SQL error 547), and the SQL filter of
  // Part 6 answers 409 "Không thể xoá vì dữ liệu đang được sử dụng". Hide it instead.
  async remove(id: number): Promise<void> {
    const product = await this.findOne(id);
    await this.productsRepo.manager.transaction(async (manager) => {
      await manager.delete(ProductVariant, { productId: id });
      await manager.remove(product); // images go too: ON DELETE CASCADE
    });
  }

  async addVariant(productId: number, dto: CreateVariantDto) {
    await this.findOne(productId); // 404 for an unknown product
    this.ensureSalePriceIsValid(dto.price, dto.salePrice);
    await this.ensureSkuIsFree(dto.sku);
    const variant = this.variantsRepo.create(dto);
    variant.productId = productId;
    return this.variantsRepo.save(variant);
  }

  async updateVariant(id: number, dto: UpdateVariantDto) {
    const variant = await this.variantsRepo.findOneBy({ id });
    if (!variant)
      throw new NotFoundException(`Không tìm thấy phiên bản id=${id}`);
    // Check the pair as it WILL be: new price with old sale price, or the opposite
    this.ensureSalePriceIsValid(
      dto.price ?? variant.price,
      dto.salePrice !== undefined ? dto.salePrice : variant.salePrice,
    );
    if (dto.sku !== undefined) await this.ensureSkuIsFree(dto.sku, id);
    Object.assign(variant, dto);
    return this.variantsRepo.save(variant);
  }

  async removeVariant(id: number): Promise<void> {
    const variant = await this.variantsRepo.findOneBy({ id });
    if (!variant)
      throw new NotFoundException(`Không tìm thấy phiên bản id=${id}`);
    await this.variantsRepo.remove(variant); // ordered before -> 547 -> 409
  }

  // Same rule as CK_ProductVariants_salePrice, but with a clear message
  private ensureSalePriceIsValid(price: number, salePrice?: number | null) {
    if (salePrice != null && salePrice > price) {
      throw new BadRequestException(
        'Giá khuyến mãi không được lớn hơn giá gốc',
      );
    }
  }

  private async ensureSlugIsFree(slug: string, exceptId?: number) {
    const existing = await this.productsRepo.findOneBy({ slug });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(`Slug "${slug}" đã được dùng`);
    }
  }

  private async ensureSkuIsFree(sku: string, exceptId?: number) {
    const existing = await this.variantsRepo.findOneBy({ sku });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(`SKU "${sku}" đã được dùng`);
    }
  }
}
```

Giải thích:
- Service riêng cho admin, tách khỏi `ProductsService` của cửa hàng: hai bên có quy tắc khác nhau (admin thấy cả thứ đang ẩn). Một service phục vụ cả hai sẽ đầy `if (isAdmin)`.
- `where: [ {...}, {...} ]`: mảng trong `where` của TypeORM là **OR**. `Like('%pixel%')` → `name LIKE @0`.
- `create`: `productsRepo.save(product)` có mảng `variants` → `INSERT Products` rồi `INSERT ProductVariants` cho từng phiên bản. `save()` **tự bọc transaction** khi lưu kèm quan hệ: SKU thứ hai trùng thì sản phẩm cũng không được tạo.
- `update`: `productsRepo.update({ id }, dto)` chỉ `UPDATE` các cột có trong body, rồi đọc lại để trả về dữ liệu mới nhất (`updatedAt` mới).
- `remove`: xoá các phiên bản trước rồi mới xoá sản phẩm, trong **một transaction**. Nếu phiên bản đã có trong đơn, lệnh xoá đầu tiên lỗi, transaction rollback, không có gì bị xoá dở dang.
- `updateVariant` kiểm tra cặp giá **sau khi** áp thay đổi: hạ giá gốc xuống dưới giá khuyến mãi đang có cũng phải bị chặn.
- `ensureSkuIsFree`, `ensureSlugIsFree`: thông báo rõ ràng. Ràng buộc `UNIQUE` trong database vẫn là lưới an toàn cuối cùng.

## Bước 4: Controller và module

Tạo `src/products/admin-products.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AdminProductsService } from './admin-products.service.js';
import {
  CreateProductDto,
  CreateVariantDto,
} from './dto/create-product.dto.js';
import { ListAdminProductsQueryDto } from './dto/list-admin-products-query.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

// @Roles on the CLASS: every route of this controller is admin only.
// Safe here because, unlike CategoriesController, nothing in it is @Public().
@ApiTags('Admin: Sản phẩm')
@Roles('admin')
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly adminProducts: AdminProductsService) {}

  @ApiOperation({ summary: 'Tất cả sản phẩm, kể cả đang ẩn' })
  @Get()
  findAll(@Query() query: ListAdminProductsQueryDto) {
    return this.adminProducts.findAll(query);
  }

  @ApiOperation({ summary: 'Chi tiết sản phẩm, kể cả phiên bản đang ẩn' })
  @ApiNotFoundResponse({ description: 'Không có sản phẩm' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.adminProducts.findOne(id);
  }

  @ApiOperation({ summary: 'Tạo sản phẩm cùng các phiên bản' })
  @ApiBadRequestResponse({
    description:
      'Dữ liệu sai, giá khuyến mãi > giá gốc, danh mục/hãng không tồn tại',
  })
  @ApiConflictResponse({ description: 'Slug hoặc SKU đã được dùng' })
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.adminProducts.create(dto);
  }

  @ApiOperation({ summary: 'Sửa thông tin sản phẩm (ẩn/hiện: isActive)' })
  @ApiNotFoundResponse({ description: 'Không có sản phẩm' })
  @ApiConflictResponse({ description: 'Slug đã được dùng' })
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.adminProducts.update(id, dto);
  }

  @ApiOperation({
    summary: 'Xoá hẳn sản phẩm chưa từng được đặt mua (đã bán thì hãy ẩn)',
  })
  @ApiNotFoundResponse({ description: 'Không có sản phẩm' })
  @ApiConflictResponse({ description: 'Sản phẩm đã có trong đơn hàng' })
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.adminProducts.remove(id);
  }

  @ApiOperation({ summary: 'Thêm phiên bản cho sản phẩm' })
  @ApiNotFoundResponse({ description: 'Không có sản phẩm' })
  @ApiConflictResponse({ description: 'SKU đã được dùng' })
  @Post(':id/variants')
  addVariant(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateVariantDto,
  ) {
    return this.adminProducts.addVariant(id, dto);
  }
}
```

Tạo `src/products/admin-variants.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AdminProductsService } from './admin-products.service.js';
import { UpdateVariantDto } from './dto/update-variant.dto.js';

// A variant has its own id, so it gets short URLs: /admin/variants/12
@ApiTags('Admin: Sản phẩm')
@Roles('admin')
@Controller('admin/variants')
export class AdminVariantsController {
  constructor(private readonly adminProducts: AdminProductsService) {}

  @ApiOperation({ summary: 'Sửa phiên bản: giá, khuyến mãi, tồn kho, ẩn/hiện' })
  @ApiNotFoundResponse({ description: 'Không có phiên bản' })
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVariantDto) {
    return this.adminProducts.updateVariant(id, dto);
  }

  @ApiOperation({ summary: 'Xoá phiên bản chưa từng được đặt mua' })
  @ApiNotFoundResponse({ description: 'Không có phiên bản' })
  @ApiConflictResponse({ description: 'Phiên bản đã có trong đơn hàng' })
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.adminProducts.removeVariant(id);
  }
}
```

Thay toàn bộ `src/products/products.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminProductsController } from './admin-products.controller.js';
import { AdminProductsService } from './admin-products.service.js';
import { AdminVariantsController } from './admin-variants.controller.js';
import { ProductImage } from './entities/product-image.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { Product } from './entities/product.entity.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductVariant, ProductImage])],
  // Shop and admin share the same entities, so they live in the same module
  controllers: [
    ProductsController,
    AdminProductsController,
    AdminVariantsController,
  ],
  providers: [ProductsService, AdminProductsService],
})
export class ProductsModule {}
```

- `@Roles('admin')` đặt trên **class**: áp cho mọi route. Ở Phần 7 ta tránh làm vậy với `CategoriesController` vì nó có route `@Public()`; hai controller admin này không có route public nào nên làm được.
- Đường dẫn bắt đầu bằng `admin/`: nhìn URL là biết API dành cho trang quản trị, dễ đặt quy tắc riêng sau này (ghi log, giới hạn IP...).

## Bước 5: Test

Tạo `src/products/admin-products.service.spec.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminProductsService } from './admin-products.service.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { Product } from './entities/product.entity.js';

describe('AdminProductsService', () => {
  let service: AdminProductsService;
  const productsRepo = {
    findOne: vi.fn(),
    findOneBy: vi.fn(),
    findAndCount: vi.fn(),
    create: vi.fn((data: object) => data),
    save: vi.fn(async (data: object) => ({ id: 7, ...data })),
    update: vi.fn(),
  };
  const variantsRepo = {
    findOneBy: vi.fn(),
    create: vi.fn((data: object) => ({ ...data })),
    save: vi.fn(async (data: object) => data),
    remove: vi.fn(),
  };

  const newProduct = (variant: object = {}): CreateProductDto => ({
    categoryId: 1,
    brandId: 1,
    name: 'Google Pixel 10',
    slug: 'google-pixel-10',
    variants: [
      {
        sku: 'GP10-128-BLK',
        name: '128GB - Đen',
        price: 18990000,
        stock: 20,
        ...variant,
      },
    ],
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    productsRepo.findOneBy.mockResolvedValue(null); // slug free
    variantsRepo.findOneBy.mockResolvedValue(null); // sku free
    productsRepo.findOne.mockResolvedValue({ id: 7 }); // read back after save
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminProductsService,
        { provide: getRepositoryToken(Product), useValue: productsRepo },
        { provide: getRepositoryToken(ProductVariant), useValue: variantsRepo },
      ],
    }).compile();
    service = module.get(AdminProductsService);
  });

  describe('create', () => {
    it('saves the product with its variants in one save()', async () => {
      await service.create(newProduct());

      expect(productsRepo.save).toHaveBeenCalledOnce();
      expect(productsRepo.save.mock.calls[0]?.[0]).toMatchObject({
        slug: 'google-pixel-10',
        variants: [{ sku: 'GP10-128-BLK' }],
      });
    });

    it('rejects a sale price above the price', async () => {
      await expect(
        service.create(newProduct({ salePrice: 19990000 })),
      ).rejects.toThrow(BadRequestException);
      expect(productsRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a SKU already used by another variant', async () => {
      variantsRepo.findOneBy.mockResolvedValue({ id: 99, sku: 'GP10-128-BLK' });
      await expect(service.create(newProduct())).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('updateVariant', () => {
    const existing = () => ({
      id: 3,
      sku: 'GP10-128-BLK',
      price: 18990000,
      salePrice: 17990000,
      stock: 20,
    });

    // The rule is checked on the pair AFTER the change, not on the body alone
    it('rejects lowering the price below the current sale price', async () => {
      variantsRepo.findOneBy.mockResolvedValue(existing());
      await expect(
        service.updateVariant(3, { price: 15000000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts lowering the price when the sale price is removed too', async () => {
      variantsRepo.findOneBy.mockResolvedValue(existing());
      await expect(
        service.updateVariant(3, { price: 15000000, salePrice: null }),
      ).resolves.toMatchObject({ price: 15000000, salePrice: null });
    });

    it('returns 404 for an unknown variant', async () => {
      variantsRepo.findOneBy.mockResolvedValue(null);
      await expect(service.updateVariant(999, { stock: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
```

Tạo `test/admin-products.e2e-spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Product } from './../src/products/entities/product.entity.js';
import { bearer } from './auth-helper.js';

describe('Admin products (e2e)', () => {
  let app: INestApplication<App>;
  let admin: string;
  const slug = `e2e-phone-${Date.now()}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    admin = await bearer(app, 'admin');
  });

  afterAll(async () => {
    // In case a test failed half way: remove the test product (variants first)
    const product = await app
      .get(DataSource)
      .getRepository(Product)
      .findOneBy({ slug });
    if (product) {
      await request(app.getHttpServer())
        .delete(`/api/v1/admin/products/${product.id}`)
        .set('Authorization', admin);
    }
    await app.close();
  });

  it('a customer gets 403 on admin routes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/products')
      .set('Authorization', await bearer(app, 'customer'))
      .expect(403);
  });

  it('creates a product with variants, hides it, then deletes it', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/products')
      .set('Authorization', admin)
      .send({
        categoryId: 1,
        brandId: 1,
        name: 'E2E Phone',
        slug,
        specs: { chip: 'Test' },
        variants: [
          { sku: `E2E-${Date.now()}`, name: '128GB', price: 1000000, stock: 5 },
        ],
      })
      .expect(201);
    expect(created.body.variants).toHaveLength(1);
    expect(created.body.specs).toEqual({ chip: 'Test' });

    // Hidden products disappear from the shop
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/products/${created.body.id}`)
      .set('Authorization', admin)
      .send({ isActive: false })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/products/${slug}`)
      .expect(404);

    // Never ordered: it can really be deleted
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/products/${created.body.id}`)
      .set('Authorization', admin)
      .expect(204);
  });

  it('an unknown category gives 400 (foreign key error through the SQL filter)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/products')
      .set('Authorization', admin)
      .send({
        categoryId: 999999,
        brandId: 1,
        name: 'X',
        slug: `${slug}-x`,
        variants: [
          { sku: `E2E-X-${Date.now()}`, name: 'X', price: 1000000, stock: 1 },
        ],
      })
      .expect(400);
  });
});
```

Test e2e tạo, ẩn, rồi xoá sản phẩm thử. `afterAll` dọn dẹp phòng khi test hỏng giữa chừng.

## Bước 6: Gọi thử trên Swagger

Đăng nhập admin, **Authorize** (Phần 8), rồi thử trong nhóm **Admin: Sản phẩm**:

1. `POST /admin/products` với body mẫu (Google Pixel 10, 2 phiên bản) → 201. Gửi lại → 409 "Slug ... đã được dùng".
2. Đổi `categoryId` thành `999` → 400 "Dữ liệu liên quan không tồn tại".
3. `PATCH /admin/products/{id}` với `{ "isActive": false }`, rồi `GET /products/google-pixel-10` (nhóm Sản phẩm) → 404: cửa hàng không còn thấy.
4. `PATCH /admin/variants/{id}` với `{ "price": 15000000 }` khi giá khuyến mãi đang là 17.990.000 → 400.
5. `DELETE /admin/products/1` (iPhone 17 Pro Max, đã có trong đơn hàng ở Phần 11) → 409. `GET /admin/products/1` → vẫn đủ 4 phiên bản: transaction đã rollback.
6. `DELETE` sản phẩm Pixel vừa tạo → 204.

## Kiểm tra

- [ ] Khách gọi `/admin/...` → 403; chưa đăng nhập → 401
- [ ] Tạo được sản phẩm kèm phiên bản trong một request; trùng slug/SKU → 409; khuyến mãi > giá → 400
- [ ] Sản phẩm ẩn biến mất khỏi `GET /products` nhưng vẫn có trong `GET /admin/products`
- [ ] Xoá sản phẩm đã bán → 409, dữ liệu còn nguyên; xoá sản phẩm chưa bán → 204
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` đều qua
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. Thêm bộ lọc `?isActive=false` cho `GET /admin/products` để admin xem nhanh các sản phẩm đang ẩn (gợi ý: `@Transform` như `featured` ở Phần 6).
2. Viết test e2e: tạo đơn hàng chứa một phiên bản của sản phẩm thử, rồi `DELETE /admin/variants/:id` phải trả 409.
