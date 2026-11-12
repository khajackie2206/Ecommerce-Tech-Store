import { Module } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { ProductsController } from './products.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { ProductImage } from './entities/product-image.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductVariant, ProductImage])],
  providers: [ProductsService],
  controllers: [ProductsController],
})
export class ProductsModule {}
