import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Order } from './order.entity.js';

// One line of an order. Name and price are COPIED from the product at the time of
// purchase (a snapshot): if the shop later renames the product or changes its price,
// old orders must still show what the customer actually bought and paid.
@Entity('OrderItems')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uniqueidentifier' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Relation<Order>;

  // Still points at the variant (for stock, reports), but no relation is needed here
  @Column({ type: 'int' })
  variantId: number;

  @Column({ type: 'nvarchar', length: 200 })
  productName: string;

  @Column({ type: 'nvarchar', length: 150 })
  variantName: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  unitPrice: number;

  @Column({ type: 'int' })
  quantity: number;
}
