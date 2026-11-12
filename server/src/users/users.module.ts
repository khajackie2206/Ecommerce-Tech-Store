import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  // Other modules (AuthModule) that import UsersModule can inject UsersService
  exports: [UsersService],
})
export class UsersModule {}
