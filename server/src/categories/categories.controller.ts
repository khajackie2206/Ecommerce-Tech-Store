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
import { CategoriesService } from './categories.service.js';
// Regular (not "import type") imports: ValidationPipe needs the DTO classes at runtime
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

// Every route here starts with /api/v1/categories (global prefix + 'categories').
// @ApiTags: group name shown in Swagger (default would be the class name)
@ApiTags('Danh mục')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @ApiOperation({ summary: 'Danh sách danh mục, theo thứ tự hiển thị' })
  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @Public()
  @ApiOperation({ summary: 'Chi tiết một danh mục' })
  @ApiNotFoundResponse({ description: 'Không có danh mục với id này' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.findOne(id);
  }

  @Roles('admin')
  @ApiOperation({ summary: 'Tạo danh mục' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ' })
  @ApiConflictResponse({ description: 'Slug đã được dùng' })
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Roles('admin')
  @ApiOperation({ summary: 'Sửa một phần danh mục' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ' })
  @ApiNotFoundResponse({ description: 'Không có danh mục với id này' })
  @ApiConflictResponse({ description: 'Slug đã được dùng' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  // 204 No Content: success, empty body
  @Roles('admin')
  @ApiOperation({ summary: 'Xoá danh mục' })
  @ApiNotFoundResponse({ description: 'Không có danh mục với id này' })
  @ApiConflictResponse({ description: 'Danh mục còn sản phẩm, không xoá được' })
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
}
