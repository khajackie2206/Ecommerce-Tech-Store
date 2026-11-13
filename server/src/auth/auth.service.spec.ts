import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  const jwtService = new JwtService({ secret: 'test-secret' }); // a real one, test key
  // Fake UsersService: no database in unit tests
  const usersService = {
    findByEmail: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
  };

  // Builds a User like the one TypeORM would return
  const makeUser = (data: Partial<User>) =>
    Object.assign(new User(), {
      id: 'A1B2C3D4-0000-0000-0000-000000000001',
      email: 'an@mail.com',
      fullName: 'Nguyễn An',
      role: 'customer',
      isActive: true,
      ...data,
    });

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('stores an argon2 hash, never the plain password', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockImplementation((data: Partial<User>) =>
        Promise.resolve(makeUser(data)),
      );

      await service.register({
        email: 'an@mail.com',
        password: 'matkhau123',
        fullName: 'Nguyễn An',
      });

      const saved = usersService.create.mock.calls[0]?.[0];
      expect(saved.passwordHash).not.toBe('matkhau123');
      expect(saved.passwordHash.startsWith('$argon2')).toBe(true);
      expect(await argon2.verify(saved.passwordHash, 'matkhau123')).toBe(true);
    });

    it('throws 409 when the email is taken', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser({}));
      await expect(
        service.register({
          email: 'an@mail.com',
          password: 'matkhau123',
          fullName: 'Nguyễn An',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('returns a token whose payload holds id, email and role', async () => {
      const passwordHash = await argon2.hash('matkhau123');
      usersService.findByEmail.mockResolvedValue(makeUser({ passwordHash }));

      const result = await service.login({
        email: 'an@mail.com',
        password: 'matkhau123',
      });

      const payload = await jwtService.verifyAsync(result.accessToken);
      expect(payload).toMatchObject({
        sub: 'A1B2C3D4-0000-0000-0000-000000000001',
        email: 'an@mail.com',
        role: 'customer',
      });
    });

    it('gives the same 401 message for a wrong password and an unknown email', async () => {
      const passwordHash = await argon2.hash('matkhau123');
      usersService.findByEmail.mockResolvedValueOnce(
        makeUser({ passwordHash }),
      );
      const wrongPassword = service.login({
        email: 'an@mail.com',
        password: 'sai-mat-khau1',
      });
      await expect(wrongPassword).rejects.toThrow(UnauthorizedException);
      await expect(wrongPassword).rejects.toThrow(
        'Email hoặc mật khẩu không đúng',
      );

      usersService.findByEmail.mockResolvedValueOnce(null);
      await expect(
        service.login({ email: 'ai@mail.com', password: 'matkhau123' }),
      ).rejects.toThrow('Email hoặc mật khẩu không đúng');
    });

    it('rejects a locked account even with the right password', async () => {
      const passwordHash = await argon2.hash('matkhau123');
      usersService.findByEmail.mockResolvedValue(
        makeUser({ passwordHash, isActive: false }),
      );
      await expect(
        service.login({ email: 'an@mail.com', password: 'matkhau123' }),
      ).rejects.toThrow('Tài khoản đã bị khoá');
    });
  });

  describe('getProfile', () => {
    it('returns fresh data from the database', async () => {
      usersService.findById.mockResolvedValue(
        makeUser({ fullName: 'Tên mới' }),
      );

      const user = await service.getProfile(
        'A1B2C3D4-0000-0000-0000-000000000001',
      );

      expect(user.fullName).toBe('Tên mới');
      expect(usersService.findById).toHaveBeenCalledWith(
        'A1B2C3D4-0000-0000-0000-000000000001',
      );
    });

    // Token still valid, but the account changed after login
    it.each([
      ['deleted', null],
      ['locked', makeUser({ isActive: false })],
    ])('rejects a %s account with 401', async (_why, found) => {
      usersService.findById.mockResolvedValue(found);
      await expect(service.getProfile('any-id')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
