import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JwtPayload, RequestWithUser } from '../jwt-payload.js';

// @CurrentUser() user: JwtPayload - the logged-in user that AuthGuard put on the request.
// Works like @Body() or @Param(), but reads request.user.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload =>
    ctx.switchToHttp().getRequest<RequestWithUser>().user,
);
