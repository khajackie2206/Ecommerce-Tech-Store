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
