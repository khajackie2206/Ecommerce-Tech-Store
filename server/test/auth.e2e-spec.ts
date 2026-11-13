import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { User } from './../src/users/user.entity.js';

// Register -> login flow against the real database (SQL Server must be running)
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const email = `auth-e2e-${Date.now()}@test.local`;
  const password = 'matkhau123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.get(DataSource).getRepository(User).delete({ email });
    await app.close();
  });

  it('POST /auth/register creates the account and never returns passwordHash', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, fullName: 'Người Test' })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.role).toBe('customer');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('POST /auth/register with the same email returns 409', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, fullName: 'Người Test' })
      .expect(409);
  });

  it('POST /auth/register validates the password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'x@test.local', password: 'abc', fullName: 'X' })
      .expect(400);

    expect(res.body.message).toContain('Mật khẩu tối thiểu 8 ký tự');
  });

  it('POST /auth/login returns 200 with a token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('POST /auth/login with a wrong password returns 401', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'sai-mat-khau1' })
      .expect(401);
  });
});
