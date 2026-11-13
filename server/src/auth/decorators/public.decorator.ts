import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Every route requires a login by default (AuthGuard is global).
// @Public() marks the exceptions: product pages, login, register...
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
