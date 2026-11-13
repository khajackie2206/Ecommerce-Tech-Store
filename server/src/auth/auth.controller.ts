import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
// Regular (not "import type") imports: ValidationPipe needs the DTO classes at runtime
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type { JwtPayload } from './jwt-payload.js';

// Routes under /api/v1/auth
@ApiTags('Tài khoản')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/v1/auth/register - 201 Created: a new user row exists
  @Public()
  @ApiOperation({ summary: 'Đăng ký tài khoản khách hàng, trả về token' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ' })
  @ApiConflictResponse({ description: 'Email đã được đăng ký' })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // POST /api/v1/auth/login - 200 OK: nothing is created, we only check credentials
  @Public()
  @ApiOperation({
    summary: 'Đăng nhập, trả về token',
    description:
      'Copy accessToken, bấm nút Authorize ở đầu trang và dán vào để gọi các API cần đăng nhập.',
  })
  @ApiUnauthorizedResponse({ description: 'Sai email hoặc mật khẩu' })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // GET /api/v1/auth/me - not @Public(): AuthGuard requires "Authorization: Bearer <token>"
  @ApiOperation({ summary: 'Thông tin tài khoản đang đăng nhập' })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập hoặc token hết hạn' })
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }
}
