import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productService: ProductsService) {}

  @Get()
  findAll(@Query() query: ListProductsQueryDto) {
    return this.productService.findAll(query);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.productService.findBySlug(slug);
  }
}
