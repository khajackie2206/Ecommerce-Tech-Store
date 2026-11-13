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
import { Brand } from '../../brands/brands.entity.js';
import { Category } from '../../categories/category.entity.js';
import { ProductImage } from './product-image.entity.js';
import { ProductVariant } from './product-variant.entity.js';
import { jsonTransformer } from '../../common/transformers.js';

// Maps the existing Products table (database/schema.sql). One row per model,
// e.g. "iPhone 17 Pro Max"; prices and stock live in ProductVariant.
@Entity('Products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  // Foreign key column, kept as a plain property so filters can use it directly
  @Column({ type: 'int' })
  categoryId: number;

  // MANY products belong to ONE category; @JoinColumn reuses the categoryId column above
  @ManyToOne(() => Category)
  @JoinColumn({ name: 'categoryId' })
  category: Relation<Category>;

  @Column({ type: 'int' })
  brandId: number;

  @ManyToOne(() => Brand)
  @JoinColumn({ name: 'brandId' })
  brand: Relation<Brand>;

  @Column({ type: 'nvarchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 220, unique: true })
  slug: string;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  shortDescription: string | null;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  description: string | null;

  // JSON text in the database, a plain object in TypeScript
  @Column({
    type: 'nvarchar',
    length: 'MAX',
    nullable: true,
    transformer: jsonTransformer,
  })
  specs: Record<string, string> | null;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  thumbnailUrl: string | null;

  @Column({ type: 'bit', default: false })
  isFeatured: boolean;

  @Column({ type: 'bit', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'datetime2' })
  createdAt: Date;

  // TypeORM sets this automatically every time the row is saved
  @UpdateDateColumn({ type: 'datetime2' })
  updatedAt: Date;

  // ONE product has MANY variants / images (the inverse side: creates no column)
  // cascade insert: saving a new Product with variants inserts the variants too (admin)
  @OneToMany(() => ProductVariant, (variant) => variant.product, {
    cascade: ['insert'],
  })
  variants: Relation<ProductVariant[]>;

  @OneToMany(() => ProductImage, (image) => image.product)
  images: Relation<ProductImage[]>;
}
