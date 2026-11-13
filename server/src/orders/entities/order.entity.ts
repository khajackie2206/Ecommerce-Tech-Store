import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../../users/user.entity.js';
import { OrderItem } from './order-item.entity.js';

// The values CK_Orders_status / CK_Orders_paymentMethod allow in schema.sql
export const ORDER_STATUSES = [
  'pending', // just placed, waiting for the shop to confirm
  'confirmed',
  'shipping',
  'completed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ['cod', 'bank_transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Maps the existing Orders table (database/schema.sql)
@Entity('Orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Short code shown to customers, e.g. TS261108K3P9QZ
  @Column({ type: 'varchar', length: 20, unique: true })
  code: string;

  @Column({ type: 'uniqueidentifier' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: OrderStatus;

  @Column({ type: 'varchar', length: 20, default: 'cod' })
  paymentMethod: PaymentMethod;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  shippingFee: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  total: number;

  @Column({ type: 'nvarchar', length: 100 })
  shippingName: string;

  @Column({ type: 'varchar', length: 20 })
  shippingPhone: string;

  @Column({ type: 'nvarchar', length: 500 })
  shippingAddress: string;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  note: string | null;

  // cascade insert: saving an Order with items inserts the OrderItems too
  @OneToMany(() => OrderItem, (item) => item.order, { cascade: ['insert'] })
  items: Relation<OrderItem>[];

  @CreateDateColumn({ type: 'datetime2' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime2' })
  updatedAt: Date;
}
