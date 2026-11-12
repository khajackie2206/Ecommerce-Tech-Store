import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

// Data needed to insert a user. The password is already hashed by the caller (AuthService).
export interface CreateUserData {
  email: string;
  passwordHash: string;
  fullName: string;
  phone?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  // Emails are stored in lowercase, so " An@Mail.com " and "an@mail.com" are the same account
  findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOneBy({ email: email.trim().toLowerCase() });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepo.findOneBy({ id });
  }

  // INSERT INTO Users ... ; role, isActive and dates come from the column defaults
  create(data: CreateUserData): Promise<User> {
    const user = this.usersRepo.create({
      ...data,
      email: data.email.trim().toLowerCase(),
    });
    return this.usersRepo.save(user);
  }
}
