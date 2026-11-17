import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';

export const IS_PUBLIC_KEY = 'isPublic';

// Every route requires a login by default (AuthGuard is global).
// @Public() marks the exceptions: product pages, login, register...
// applyDecorators bundles several decorators into one:
// - SetMetadata: the flag AuthGuard reads
// - ApiSecurity({}): tells Swagger "no token needed" (no lock icon on this route)
export const Public = () =>
  applyDecorators(SetMetadata(IS_PUBLIC_KEY, true), ApiSecurity({}));
