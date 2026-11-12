import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { BrandsService } from './brands.service.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';

// Every route here starts with /api/v1/brands (global prefix + 'brands')
@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  // GET /api/v1/brands
  @Get()
  findAll() {
    return this.brandsService.findAll();
  }

  // GET /api/v1/brands/1 - ParseIntPipe turns "1" into 1, or returns 400 for "abc"
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.brandsService.findOne(id);
  }

  // POST /api/v1/brands - responds 201 Created by default
  @Post()
  create(@Body() body: CreateBrandDto) {
    return this.brandsService.create(body);
  }

  // PATCH /api/v1/brands/1 - partial update
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBrandDto) {
    return this.brandsService.update(id, dto);
  }

  // DELETE /api/v1/brands/1 - 204 No Content: success, empty body
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    // Return the Promise so Nest waits for it and turns a thrown 404 into the response
    return this.brandsService.remove(id);
  }
}
