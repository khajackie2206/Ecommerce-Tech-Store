import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

// ?page=&limit= shared by every paginated list (order history, admin lists...).
// Extend it to add filters: class ListAdminOrdersQueryDto extends PaginationQueryDto {...}
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number) // query string values are strings: "2" -> 2
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page tối thiểu là 1' })
  page = 1;

  @ApiPropertyOptional({ default: 10 })
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(50, { message: 'limit tối đa là 50' })
  limit = 10;
}

// Shape of every paginated response
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
