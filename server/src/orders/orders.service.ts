import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import { Order } from './entities/order.entity.js';
import { generateOrderCode } from './order-code.js';

// Shipping rule of the shop: free from 2,000,000 VND, otherwise a flat fee
export const FREE_SHIPPING_FROM = 2_000_000;
export const SHIPPING_FEE = 30_000;

@Injectable()
export class OrdersService {
  // DataSource (not a single Repository): placing an order touches several tables
  // inside ONE transaction
  constructor(private readonly dataSource: DataSource) {}

  // Place an order: check stock, take it, save the order. All or nothing.
  create(userId: string, dto: CreateOrderDto): Promise<Order> {
    // transaction(): BEGIN TRANSACTION, run the callback, COMMIT.
    // If the callback throws (out of stock, any SQL error), TypeORM runs ROLLBACK:
    // the stock taken so far is given back automatically.
    // Inside, EVERY query must go through `manager`, otherwise it runs outside the transaction.
    return this.dataSource.transaction(async (manager) => {
      const variants = await this.lockVariants(
        manager,
        dto.items.map((line) => line.variantId),
      );

      const items = dto.items.map((line) => {
        const variant = variants.get(line.variantId);
        if (!variant || !variant.isActive || !variant.product.isActive) {
          throw new BadRequestException(
            `Phiên bản #${line.variantId} không còn được bán`,
          );
        }
        if (variant.stock < line.quantity) {
          throw new ConflictException(
            `"${variant.product.name} ${variant.name}" chỉ còn ${variant.stock} sản phẩm`,
          );
        }
        return {
          variantId: variant.id,
          // Snapshot: copy name and price as they are right now
          productName: variant.product.name,
          variantName: variant.name,
          unitPrice: variant.salePrice ?? variant.price,
          quantity: line.quantity,
        };
      });

      // Take the stock: UPDATE ProductVariants SET stock = stock - @0 WHERE id = @1
      for (const item of items) {
        await manager.decrement(
          ProductVariant,
          { id: item.variantId },
          'stock',
          item.quantity,
        );
      }

      const subtotal = items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );
      const shippingFee = subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;

      const order = manager.create(Order, {
        code: generateOrderCode(),
        userId,
        paymentMethod: dto.paymentMethod ?? 'cod',
        subtotal,
        shippingFee,
        total: subtotal + shippingFee, // CK_Orders_total checks this sum too
        shippingName: dto.shippingName,
        shippingPhone: dto.shippingPhone,
        shippingAddress: dto.shippingAddress,
        note: dto.note ?? null,
        items, // cascade: ['insert'] -> INSERT INTO OrderItems for each line
      });
      return manager.save(order);
    });
  }

  // SELECT the variants WITH (UPDLOCK, ROWLOCK): until this transaction ends, any other
  // transaction that wants to lock the same rows WAITS. Two customers buying the last
  // phone at the same moment are served one after the other, never both.
  private async lockVariants(
    manager: EntityManager,
    ids: number[],
  ): Promise<Map<number, ProductVariant>> {
    const variants = await manager
      .getRepository(ProductVariant)
      .createQueryBuilder('v')
      .setLock('pessimistic_write')
      .innerJoinAndSelect('v.product', 'p')
      .where('v.id IN (:...ids)', { ids })
      .getMany();
    return new Map(variants.map((variant) => [variant.id, variant]));
  }
}
