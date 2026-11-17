import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
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
}
