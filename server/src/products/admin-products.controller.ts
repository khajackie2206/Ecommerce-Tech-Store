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
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AdminProductsService } from './admin-products.service.js';
import {
  CreateProductDto,
  CreateVariantDto,
} from './dto/create-product.dto.js';
import { ListAdminProductsQueryDto } from './dto/list-admin-products-query.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

// @Roles on the CLASS: every route of this controller is admin only.
// Safe here because, unlike CategoriesController, nothing in it is @Public().
@ApiTags('Admin: Sản phẩm')
@Roles('admin')
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly adminProducts: AdminProductsService) {}

  @ApiOperation({ summary: 'Tất cả sản phẩm, kể cả đang ẩn' })
  @Get()
  findAll(@Query() query: ListAdminProductsQueryDto) {
    return this.adminProducts.findAll(query);
  }

  @ApiOperation({ summary: 'Chi tiết sản phẩm, kể cả phiên bản đang ẩn' })
  @ApiNotFoundResponse({ description: 'Không có sản phẩm' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.adminProducts.findOne(id);
  }

  @ApiOperation({ summary: 'Tạo sản phẩm cùng các phiên bản' })
  @ApiBadRequestResponse({
    description:
      'Dữ liệu sai, giá khuyến mãi > giá gốc, danh mục/hãng không tồn tại',
  })
  @ApiConflictResponse({ description: 'Slug hoặc SKU đã được dùng' })
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.adminProducts.create(dto);
  }

  @ApiOperation({ summary: 'Sửa thông tin sản phẩm (ẩn/hiện: isActive)' })
  @ApiNotFoundResponse({ description: 'Không có sản phẩm' })
  @ApiConflictResponse({ description: 'Slug đã được dùng' })
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.adminProducts.update(id, dto);
  }

  @ApiOperation({
    summary: 'Xoá hẳn sản phẩm chưa từng được đặt mua (đã bán thì hãy ẩn)',
  })
  @ApiNotFoundResponse({ description: 'Không có sản phẩm' })
  @ApiConflictResponse({ description: 'Sản phẩm đã có trong đơn hàng' })
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.adminProducts.remove(id);
  }

  @ApiOperation({ summary: 'Thêm phiên bản cho sản phẩm' })
  @ApiNotFoundResponse({ description: 'Không có sản phẩm' })
  @ApiConflictResponse({ description: 'SKU đã được dùng' })
  @Post(':id/variants')
  addVariant(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateVariantDto,
  ) {
    return this.adminProducts.addVariant(id, dto);
  }
}
