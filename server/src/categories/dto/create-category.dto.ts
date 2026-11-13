import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Body accepted by POST /api/v1/categories.
// Only the properties declared here get through (ValidationPipe whitelist).
export class CreateCategoryDto {
  @ApiProperty({ example: 'Đồng hồ thông minh' })
  @IsString({ message: 'Tên danh mục phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên danh mục không được để trống' })
  @MaxLength(100, { message: 'Tên danh mục tối đa 100 ký tự' })
  name: string;

  // URL-friendly name: lowercase letters, digits and single dashes, e.g. "dien-thoai"
  @ApiProperty({ example: 'dong-ho' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang',
  })
  // Same limit as the column: Categories.slug is VARCHAR(120)
  @MaxLength(120, { message: 'Slug tối đa 120 ký tự' })
  slug: string;

  @IsOptional()
  @IsInt({ message: 'sortOrder phải là số nguyên' })
  @Min(0, { message: 'sortOrder không được âm' })
  sortOrder?: number;

  @IsOptional()
  @IsBoolean({ message: 'isActive phải là true hoặc false' })
  isActive?: boolean;
}
