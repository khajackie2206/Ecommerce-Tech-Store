import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../../users/user.entity.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { RequestWithUser } from '../jwt-payload.js';

// Runs right after AuthGuard (registered after it in AppModule),
// so request.user is already set for every non-public route.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      UserRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    // No @Roles() on this route: nothing more to check
    if (!requiredRoles?.length) return true;

    // 401 = "who are you?" (AuthGuard), 403 = "I know who you are, but you may not"
    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }
    return true;
  }
}
