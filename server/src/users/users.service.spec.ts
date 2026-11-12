import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;
  // Fake repository: only the methods UsersService calls
  const usersRepo = {
    findOneBy: vi.fn(),
    create: vi.fn((data: Partial<User>) => data),
    save: vi.fn((user: Partial<User>) => Promise.resolve(user)),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('findByEmail looks up the trimmed, lowercase email', async () => {
    await service.findByEmail('  An@Mail.COM ');
    expect(usersRepo.findOneBy).toHaveBeenCalledWith({ email: 'an@mail.com' });
  });

  it('create stores the email in lowercase', async () => {
    const user = await service.create({
      email: 'An@Mail.com',
      passwordHash: 'hash',
      fullName: 'An Nguyen',
    });
    expect(user.email).toBe('an@mail.com');
    expect(usersRepo.save).toHaveBeenCalledOnce();
  });
});
