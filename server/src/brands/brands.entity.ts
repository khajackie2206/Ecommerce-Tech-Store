import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Maps the existing Brands table (database/schema.sql).
// DB_SYNCHRONIZE=false, so TypeORM never changes the table: these decorators
// must describe it exactly (names, types, lengths, nullability).
@Entity('Brands')
export class Brand {
  // INT IDENTITY(1,1): SQL Server generates the id
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'nvarchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  slug: string;

  // NULL allowed in the table, so the property can be null too
  @Column({ type: 'nvarchar', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'bit', default: true })
  isActive: boolean;

  // Filled by SQL Server (DEFAULT SYSUTCDATETIME()) when the row is inserted
  @CreateDateColumn({ type: 'datetime2' })
  createdAt: Date;
}
