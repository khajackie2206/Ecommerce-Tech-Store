import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from './../src/users/user.entity.js';

// Builds an "Authorization" header value for e2e tests, without registering a real user.
// AuthGuard only checks the token's signature, so a token signed by the app's own
// JwtService (same JWT_SECRET) is accepted.
export async function bearer(
  app: INestApplication,
  role: UserRole = 'customer',
): Promise<string> {
  const token = await app.get(JwtService).signAsync({
    sub: '00000000-0000-0000-0000-000000000000',
    email: `${role}@test.local`,
    role,
  });
  return `Bearer ${token}`;
}
