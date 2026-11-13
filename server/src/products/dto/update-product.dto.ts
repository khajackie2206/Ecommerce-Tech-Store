import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto.js';

// PATCH /api/v1/admin/products/:id: any product field, but NOT the variants
// (they have their own routes). OmitType removes a field, PartialType makes the rest optional.
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['variants'] as const),
) {}
