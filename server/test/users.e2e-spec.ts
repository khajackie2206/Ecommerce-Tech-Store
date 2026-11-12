import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { User } from './../src/users/user.entity.js';
import { UsersService } from './../src/users/users.service.js';

// Checks that the User entity matches the real Users table (SQL Server must be running)
describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  // A unique email per run, so the test can be repeated without "already exists" errors
  const email = `e2e-${Date.now()}@test.local`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    // Clean up the row this test inserted
    await app.get(DataSource).getRepository(User).delete({ email });
    await app.close();
  });

  it('creates a user and reads it back with the database defaults', async () => {
    const users = app.get(UsersService);
    const created = await users.create({
      email: email.toUpperCase(),
      passwordHash: 'not-a-real-hash',
      fullName: 'Test User',
    });

    // Values filled in by SQL Server: GUID id, role/isActive defaults, dates
    expect(created.id).toMatch(/^[0-9A-F-]{36}$/i);
    expect(created.role).toBe('customer');
    expect(created.isActive).toBe(true);
    expect(created.createdAt).toBeInstanceOf(Date);

    const found = await users.findByEmail(email);
    expect(found?.id).toBe(created.id);
    expect(found?.fullName).toBe('Test User');
  });
});
