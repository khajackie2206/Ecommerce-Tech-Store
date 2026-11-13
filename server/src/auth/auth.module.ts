import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    UsersModule, // gives us UsersService (exported by UsersModule)

    // JwtService, configured from .env. global: true lets the auth guard
    // (next task) inject JwtService from any module without importing JwtModule again.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          // Token lifetime in seconds (86400 = 1 day). After that the client must log in again.
          expiresIn: Number(config.get('JWT_EXPIRES_IN', 86400)),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
