import { ApiProperty } from '@nestjs/swagger';

// Response shapes of GET /api/v1/products.
// They are classes (not interfaces) in a *.dto.ts file only so the Swagger plugin
// can read them: interfaces disappear at runtime, Swagger would show "object".

export class NameSlugDto {
  @ApiProperty({ example: 'Điện thoại' })
  name: string;

  @ApiProperty({ example: 'dien-thoai' })
  slug: string;
}

export class ProductListItem {
  id: number;

  @ApiProperty({ example: 'iPhone 17 Pro Max' })
  name: string;

  @ApiProperty({ example: 'iphone-17-pro-max' })
  slug: string;

  shortDescription: string | null;
  thumbnailUrl: string | null;
  isFeatured: boolean;
  category: NameSlugDto;
  brand: NameSlugDto;

  @ApiProperty({
    description: 'Giá thấp nhất sau khuyến mãi',
    example: 34990000,
  })
  fromPrice: number;

  @ApiProperty({ description: 'Giá niêm yết thấp nhất', example: 37990000 })
  listPrice: number;

  @ApiProperty({ description: 'Còn ít nhất một phiên bản có hàng' })
  inStock: boolean;
}

export class ProductListResult {
  items: ProductListItem[];

  @ApiProperty({ description: 'Tổng số sản phẩm khớp bộ lọc', example: 25 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 12 })
  limit: number;
}
