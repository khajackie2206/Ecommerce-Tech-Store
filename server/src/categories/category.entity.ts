import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('Categories')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'nvarchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  slug: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'bit', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'datetime2' })
  createdAt: Date;
}
