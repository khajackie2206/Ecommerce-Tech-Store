import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../users/user.entity.js';

export const ROLES_KEY = 'roles';

// @Roles('admin') - only users with one of these roles may call the route (else 403).
// Routes without @Roles() are open to any logged-in user.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
