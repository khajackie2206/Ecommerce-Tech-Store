import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { ProductsService } from './products.service.js';

@ApiTags('Sản phẩm')
@Controller('products')
export class ProductsController {
  constructor(private readonly productService: ProductsService) {}

  @Public()
  @ApiOperation({
    summary: 'Danh sách sản phẩm: lọc, tìm kiếm, sắp xếp, phân trang',
    description:
      'Mọi tham số đều không bắt buộc. Giá lọc theo giá sau khuyến mãi (VND).',
  })
  @ApiBadRequestResponse({
    description: 'Tham số không hợp lệ, ví dụ limit > 50',
  })
  @Get()
  findAll(@Query() query: ListProductsQueryDto) {
    return this.productService.findAll(query);
  }

  @Public()
  @ApiOperation({
    summary: 'Chi tiết sản phẩm: danh mục, hãng, các phiên bản đang bán, ảnh',
  })
  @ApiNotFoundResponse({
    description: 'Không có sản phẩm, hoặc sản phẩm đã ẩn',
  })
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.productService.findBySlug(slug);
  }
}
