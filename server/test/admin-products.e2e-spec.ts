import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Product } from './../src/products/entities/product.entity.js';
import { bearer } from './auth-helper.js';

describe('Admin products (e2e)', () => {
  let app: INestApplication<App>;
  let admin: string;
  const slug = `e2e-phone-${Date.now()}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    admin = await bearer(app, 'admin');
  });

  afterAll(async () => {
    // In case a test failed half way: remove the test product (variants first)
    const product = await app
      .get(DataSource)
      .getRepository(Product)
      .findOneBy({ slug });
    if (product) {
      await request(app.getHttpServer())
        .delete(`/api/v1/admin/products/${product.id}`)
        .set('Authorization', admin);
    }
    await app.close();
  });

  it('a customer gets 403 on admin routes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/products')
      .set('Authorization', await bearer(app, 'customer'))
      .expect(403);
  });

  it('creates a product with variants, hides it, then deletes it', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/products')
      .set('Authorization', admin)
      .send({
        categoryId: 1,
        brandId: 1,
        name: 'E2E Phone',
        slug,
        specs: { chip: 'Test' },
        variants: [
          { sku: `E2E-${Date.now()}`, name: '128GB', price: 1000000, stock: 5 },
        ],
      })
      .expect(201);
    expect(created.body.variants).toHaveLength(1);
    expect(created.body.specs).toEqual({ chip: 'Test' });

    // Hidden products disappear from the shop
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/products/${created.body.id}`)
      .set('Authorization', admin)
      .send({ isActive: false })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/products/${slug}`)
      .expect(404);

    // Never ordered: it can really be deleted
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/products/${created.body.id}`)
      .set('Authorization', admin)
      .expect(204);
  });

  it('an unknown category gives 400 (foreign key error through the SQL filter)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/products')
      .set('Authorization', admin)
      .send({
        categoryId: 999999,
        brandId: 1,
        name: 'X',
        slug: `${slug}-x`,
        variants: [
          { sku: `E2E-X-${Date.now()}`, name: 'X', price: 1000000, stock: 1 },
        ],
      })
      .expect(400);
  });
});
