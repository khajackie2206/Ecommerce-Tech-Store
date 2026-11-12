import { PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto.js';

// Body accepted by PATCH /api/v1/categories/:id:
// the same fields and rules as CreateCategoryDto, but every field is optional.
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
