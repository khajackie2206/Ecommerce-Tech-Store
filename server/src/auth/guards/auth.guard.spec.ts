import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../jwt-payload.js';
import { AuthGuard } from './auth.guard.js';

describe('AuthGuard', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });
  const reflector = new Reflector();
  const guard = new AuthGuard(jwtService, reflector);

  // Fake ExecutionContext around a request with the given headers.
  // A real one also carries the route method and class; here they are dummies.
  function contextFor(headers: Record<string, string>) {
    const request: { headers: Record<string, string>; user?: JwtPayload } = {
      headers,
    };
    const context = {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  }

  it('rejects a request without a token', async () => {
    const { context } = contextFor({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await new JwtService({ secret: 'hacker' }).signAsync({
      sub: '1',
      email: 'x@mail.com',
      role: 'admin',
    });
    const { context } = contextFor({ authorization: `Bearer ${forged}` });
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
    );
  });

  it('accepts a valid token and puts the payload on request.user', async () => {
    const token = await jwtService.signAsync({
      sub: '1',
      email: 'an@mail.com',
      role: 'customer',
    });
    const { context, request } = contextFor({
      authorization: `Bearer ${token}`,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user?.email).toBe('an@mail.com');
  });

  it('lets @Public() routes through without a token', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(true);
    const { context } = contextFor({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
