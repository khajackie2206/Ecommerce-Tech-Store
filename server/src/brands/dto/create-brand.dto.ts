import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Body accepted by POST /api/v1/brands.
// Only the properties declared here get through (ValidationPipe whitelist).
export class CreateBrandDto {
  @ApiProperty({ example: 'Xiaomi' })
  @IsString({ message: 'Tên hãng phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên hãng không được để trống' })
  @MaxLength(100, { message: 'Tên hãng tối đa 100 ký tự' })
  name: string;

  // URL-friendly name: lowercase letters, digits and single dashes, e.g. "apple"
  @ApiProperty({ example: 'xiaomi' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang',
  })
  @MaxLength(120, { message: 'Slug tối đa 120 ký tự' })
  slug: string;

  // Same limit as the column: Brands.logoUrl is NVARCHAR(500)
  @ApiProperty({ required: false, example: 'https://example.com/xiaomi.png' })
  @IsOptional()
  @IsUrl({}, { message: 'logoUrl phải là một địa chỉ URL hợp lệ' })
  @MaxLength(500, { message: 'logoUrl tối đa 500 ký tự' })
  logoUrl?: string;

  // "?": optional for TypeScript too, like @IsOptional() says for validation
  @IsOptional()
  @IsBoolean({ message: 'isActive phải là true hoặc false' })
  isActive?: boolean;
}
