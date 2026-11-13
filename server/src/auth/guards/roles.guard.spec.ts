import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../../users/user.entity.js';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  // Fake context: a request whose user (set by AuthGuard) has the given role
  function contextFor(role?: UserRole) {
    return {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    } as unknown as ExecutionContext;
  }

  // Pretend the route is decorated with @Roles(...roles)
  const routeRequires = (roles: UserRole[] | undefined) =>
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);

  it('allows any logged-in user when the route has no @Roles()', () => {
    routeRequires(undefined);
    expect(guard.canActivate(contextFor('customer'))).toBe(true);
  });

  it('allows an admin on an @Roles("admin") route', () => {
    routeRequires(['admin']);
    expect(guard.canActivate(contextFor('admin'))).toBe(true);
  });

  it('returns 403 for a customer on an @Roles("admin") route', () => {
    routeRequires(['admin']);
    expect(() => guard.canActivate(contextFor('customer'))).toThrow(
      ForbiddenException,
    );
  });
});
