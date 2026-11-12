import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from './brands.entity.js';
import { BrandsController } from './brands.controller.js';
import { BrandsService } from './brands.service.js';

@Module({
  // Registers the entity and makes Repository<Brand> injectable in this module
  imports: [TypeOrmModule.forFeature([Brand])],
  controllers: [BrandsController],
  providers: [BrandsService],
})
export class BrandsModule {}
