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
