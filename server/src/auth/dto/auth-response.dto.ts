import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../users/user.entity.js';

// What register and login send back. A class (not an interface) so Swagger can show it.
export class AuthResponse {
  @ApiProperty({
    description:
      'JWT. Gửi kèm mọi request cần đăng nhập: Authorization: Bearer <token>',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  // passwordHash is removed by ClassSerializerInterceptor
  user: User;
}
