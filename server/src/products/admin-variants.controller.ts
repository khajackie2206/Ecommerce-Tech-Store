import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AdminProductsService } from './admin-products.service.js';
import { UpdateVariantDto } from './dto/update-variant.dto.js';

// A variant has its own id, so it gets short URLs: /admin/variants/12
@ApiTags('Admin: Sản phẩm')
@Roles('admin')
@Controller('admin/variants')
export class AdminVariantsController {
  constructor(private readonly adminProducts: AdminProductsService) {}

  @ApiOperation({ summary: 'Sửa phiên bản: giá, khuyến mãi, tồn kho, ẩn/hiện' })
  @ApiNotFoundResponse({ description: 'Không có phiên bản' })
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVariantDto) {
    return this.adminProducts.updateVariant(id, dto);
  }

  @ApiOperation({ summary: 'Xoá phiên bản chưa từng được đặt mua' })
  @ApiNotFoundResponse({ description: 'Không có phiên bản' })
  @ApiConflictResponse({ description: 'Phiên bản đã có trong đơn hàng' })
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.adminProducts.removeVariant(id);
  }
}
