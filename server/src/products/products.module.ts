import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminProductsController } from './admin-products.controller.js';
import { AdminProductsService } from './admin-products.service.js';
import { AdminVariantsController } from './admin-variants.controller.js';
import { ProductImage } from './entities/product-image.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { Product } from './entities/product.entity.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductVariant, ProductImage])],
  // Shop and admin share the same entities, so they live in the same module
  controllers: [
    ProductsController,
    AdminProductsController,
    AdminVariantsController,
  ],
  providers: [ProductsService, AdminProductsService],
})
export class ProductsModule {}
