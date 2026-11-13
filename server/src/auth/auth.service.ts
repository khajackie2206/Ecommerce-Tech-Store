import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { JwtPayload } from './jwt-payload.js';

// What register and login send back to the client
export interface AuthResponse {
  accessToken: string;
  user: User; // passwordHash is removed by ClassSerializerInterceptor
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    if (await this.usersService.findByEmail(dto.email)) {
      throw new ConflictException('Email đã được đăng ký');
    }

    // argon2 adds a random salt and is slow on purpose, so leaked hashes are hard to crack.
    // The result looks like "$argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>".
    const passwordHash = await argon2.hash(dto.password);

    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      phone: dto.phone,
    });
    // Log the new customer in right away
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);

    // Same message for "no such email" and "wrong password":
    // a different message would tell attackers which emails have an account.
    const passwordOk =
      user !== null && (await argon2.verify(user.passwordHash, dto.password));
    if (!user || !passwordOk) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị khoá');
    }

    return this.buildAuthResponse(user);
  }

  private async buildAuthResponse(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    // Signed with JWT_SECRET; expires after JWT_EXPIRES_IN (configured in AuthModule)
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken, user };
  }
}
