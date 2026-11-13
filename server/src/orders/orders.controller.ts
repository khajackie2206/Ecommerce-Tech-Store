import {
  Body,
  Controller,
  Get,
  Param,
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
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrdersService } from './orders.service.js';

// Customer side of orders. Not @Public(): every route needs a logged-in user,
// and every query is limited to that user's own orders.
@ApiTags('Đơn hàng')
@ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiOperation({
    summary: 'Đặt hàng: kiểm tra tồn kho, trừ kho, lưu đơn (một transaction)',
  })
  @ApiBadRequestResponse({
    description: 'Dữ liệu không hợp lệ hoặc phiên bản không còn bán',
  })
  @ApiConflictResponse({ description: 'Không đủ hàng' })
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateOrderDto) {
    // The user id comes from the token, never from the body
    return this.ordersService.create(user.sub, dto);
  }

  @ApiOperation({ summary: 'Lịch sử đơn hàng của tôi, mới nhất trước' })
  @Get()
  findMine(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
  ) {
    return this.ordersService.findMine(user.sub, query);
  }

  @ApiOperation({ summary: 'Chi tiết một đơn hàng của tôi' })
  @ApiNotFoundResponse({ description: 'Không có đơn này trong tài khoản' })
  @Get(':code')
  findMineByCode(@CurrentUser() user: JwtPayload, @Param('code') code: string) {
    return this.ordersService.findMineByCode(user.sub, code);
  }

  @ApiOperation({
    summary: 'Huỷ đơn đang chờ xác nhận, trả lại tồn kho (một transaction)',
  })
  @ApiNotFoundResponse({ description: 'Không có đơn này trong tài khoản' })
  @ApiConflictResponse({ description: 'Đơn đã được xác nhận, không huỷ được' })
  @Patch(':code/cancel')
  cancelMine(@CurrentUser() user: JwtPayload, @Param('code') code: string) {
    return this.ordersService.cancelMine(user.sub, code);
  }
}
