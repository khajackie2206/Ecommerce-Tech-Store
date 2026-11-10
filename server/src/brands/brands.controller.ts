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
import { ApiBody } from '@nestjs/swagger';
import {
  BrandsService,
  type CreateBrandInput,
  type UpdateBrandInput,
} from './brands.service.js';

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
  // @ApiBody: Swagger can't read an interface, so we give it a sample body.
  // Part 3 replaces the interface with a DTO class and this decorator goes away.
  @ApiBody({
    schema: {
      example: {
        name: 'Google',
        slug: 'google',
        logoUrl: 'https://placehold.co/200x80?text=Google',
      },
    },
  })
  @Post()
  create(@Body() body: CreateBrandInput) {
    return this.brandsService.create(body);
  }

  // PATCH /api/v1/brands/1 - partial update
  @ApiBody({ schema: { example: { isActive: false } } })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateBrandInput,
  ) {
    return this.brandsService.update(id, body);
  }

  // DELETE /api/v1/brands/1 - 204 No Content: success, empty body
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    // Return the Promise so Nest waits for it and turns a thrown 404 into the response
    return this.brandsService.remove(id);
  }
}