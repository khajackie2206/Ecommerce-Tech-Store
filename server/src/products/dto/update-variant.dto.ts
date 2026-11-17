import { PartialType } from '@nestjs/swagger';
import { CreateVariantDto } from './create-product.dto.js';

// PATCH /api/v1/admin/variants/:id: change price, stock, hide... one field at a time
export class UpdateVariantDto extends PartialType(CreateVariantDto) {}
