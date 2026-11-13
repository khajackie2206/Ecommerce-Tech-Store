import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { UserRole } from '../../users/user.entity.js';

export const ROLES_KEY = 'roles';

// @Roles('admin') - only users with one of these roles may call the route (else 403).
// Routes without @Roles() are open to any logged-in user.
// The two Api...Response decorators document those errors in Swagger.
export const Roles = (...roles: UserRole[]) =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' }),
    ApiForbiddenResponse({ description: `Chỉ dành cho: ${roles.join(', ')}` }),
  );
