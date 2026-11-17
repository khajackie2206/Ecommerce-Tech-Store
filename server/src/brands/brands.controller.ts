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
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { BrandsService } from './brands.service.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';

// Every route here starts with /api/v1/brands (global prefix + 'brands')
@ApiTags('Hãng')
@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Public()
  @ApiOperation({ summary: 'Danh sách hãng, theo tên A-Z' })
  @Get()
  findAll() {
    return this.brandsService.findAll();
  }

  @Public()
  @ApiOperation({ summary: 'Chi tiết một hãng' })
  @ApiNotFoundResponse({ description: 'Không có hãng với id này' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.brandsService.findOne(id);
  }

  @Roles('admin')
  @ApiOperation({ summary: 'Tạo hãng' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ' })
  @ApiConflictResponse({ description: 'Slug đã được dùng' })
  @Post()
  create(@Body() dto: CreateBrandDto) {
    return this.brandsService.create(dto);
  }

  @Roles('admin')
  @ApiOperation({ summary: 'Sửa một phần hãng' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ' })
  @ApiNotFoundResponse({ description: 'Không có hãng với id này' })
  @ApiConflictResponse({ description: 'Slug đã được dùng' })
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBrandDto) {
    return this.brandsService.update(id, dto);
  }

  // 204 No Content: success, empty body
  @Roles('admin')
  @ApiOperation({ summary: 'Xoá hãng' })
  @ApiNotFoundResponse({ description: 'Không có hãng với id này' })
  @ApiConflictResponse({ description: 'Hãng còn sản phẩm, không xoá được' })
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.brandsService.remove(id);
  }
}
