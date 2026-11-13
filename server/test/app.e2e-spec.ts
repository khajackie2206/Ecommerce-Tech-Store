import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { bearer } from './auth-helper.js';

// End-to-end test: boots the real app, so SQL Server must be running (npm run db:up)
describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app); // same prefix and validation as main.ts
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1 returns the API info', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect((res) => {
        expect(res.body.name).toBe('TechStore API');
      });
  });

  it('GET /api/v1/health reports the database as up', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok', database: 'up' });
  });

  it('POST /api/v1/categories without a token returns 401', () => {
    return request(app.getHttpServer())
      .post('/api/v1/categories')
      .send({ name: 'Test', slug: 'test' })
      .expect(401);
  });

  it('POST /api/v1/categories rejects unknown fields with 400', async () => {
    return request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', await bearer(app, 'admin'))
      .send({ name: 'Test', slug: 'test', role: 'admin' })
      .expect(400);
  });
});
