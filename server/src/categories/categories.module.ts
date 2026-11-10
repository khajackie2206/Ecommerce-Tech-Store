import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Catetogy } from './category.controller.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Catetogy])],
  controllers: [CategoriesController],
  providers: [CategoriesService]
})
export class CategoriesModule {}
