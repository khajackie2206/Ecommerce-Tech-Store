import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Product } from './product.entity.js';

// Maps the existing ProductVariants table: a buyable option of a product,
// e.g. "256GB - Cam vũ trụ", with its own price and stock.
@Entity('ProductVariants')
export class ProductVariant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  productId: number;

  // MANY variants belong to ONE product
  @ManyToOne(() => Product, (product) => product.variants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Relation<Product>;

  @Column({ type: 'varchar', length: 50, unique: true })
  sku: string;

  @Column({ type: 'nvarchar', length: 150 })
  name: string;

  @Column({ type: 'nvarchar', length: 50, nullable: true })
  color: string | null;

  @Column({ type: 'nvarchar', length: 50, nullable: true })
  storage: string | null;

  // DECIMAL(18,2): money is never stored as FLOAT. The mssql driver returns it as a number.
  @Column({ type: 'decimal', precision: 18, scale: 2 })
  price: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  salePrice: number | null;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'bit', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'datetime2' })
  createdAt: Date;
}