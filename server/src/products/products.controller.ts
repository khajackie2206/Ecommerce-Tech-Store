import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { ProductsService } from './products.service.js';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productService: ProductsService) {}

  @Public()
  @Get()
  findAll(@Query() query: ListProductsQueryDto) {
    return this.productService.findAll(query);
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.productService.findBySlug(slug);
  }
}
