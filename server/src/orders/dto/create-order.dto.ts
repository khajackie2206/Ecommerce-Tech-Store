import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  PAYMENT_METHODS,
  type PaymentMethod,
} from '../entities/order.entity.js';

// One line of the cart. Only ids and quantities: the server looks up names and
// prices itself. Never trust a price sent by the browser.
export class OrderLineDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'variantId phải là số nguyên' })
  @Min(1, { message: 'variantId không hợp lệ' })
  variantId: number;

  @ApiProperty({ example: 1 })
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(1, { message: 'Số lượng tối thiểu là 1' })
  @Max(10, { message: 'Mỗi sản phẩm mua tối đa 10 chiếc' })
  quantity: number;
}

// Body accepted by POST /api/v1/orders
export class CreateOrderDto {
  // @ValidateNested + @Type: validate EVERY element of the array as an OrderLineDto
  // (without them class-validator only checks "is it an array" and lets anything in)
  @ArrayMinSize(1, { message: 'Giỏ hàng đang trống' })
  @ArrayMaxSize(20, { message: 'Tối đa 20 dòng sản phẩm mỗi đơn' })
  @ArrayUnique((line: OrderLineDto) => line.variantId, {
    message: 'Mỗi phiên bản chỉ được xuất hiện một lần',
  })
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items: OrderLineDto[];

  @ApiProperty({ example: 'Trần Thị Bình' })
  @IsString({ message: 'Tên người nhận phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên người nhận không được để trống' })
  @MaxLength(100, { message: 'Tên người nhận tối đa 100 ký tự' })
  shippingName: string;

  @ApiProperty({ example: '0901234567' })
  @Matches(/^0\d{9}$/, {
    message: 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0',
  })
  shippingPhone: string;

  @ApiProperty({ example: '12 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP.HCM' })
  @IsString({ message: 'Địa chỉ phải là chuỗi' })
  @IsNotEmpty({ message: 'Địa chỉ không được để trống' })
  @MaxLength(500, { message: 'Địa chỉ tối đa 500 ký tự' })
  shippingAddress: string;

  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;

  @IsOptional()
  @IsIn(PAYMENT_METHODS, {
    message: `Phương thức thanh toán: ${PAYMENT_METHODS.join(', ')}`,
  })
  paymentMethod?: PaymentMethod;
}
