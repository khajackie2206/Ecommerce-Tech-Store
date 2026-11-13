import type { Request } from 'express';
import type { UserRole } from '../users/user.entity.js';

// What we put inside every access token (JWT).
// The token is signed, not encrypted: anyone can read it, so never put secrets here.
export interface JwtPayload {
  sub: string; // "subject" = the user id (standard JWT claim name)
  email: string;
  role: UserRole;
}

// An Express request after AuthGuard has verified the token
export interface RequestWithUser extends Request {
  user: JwtPayload;
}
