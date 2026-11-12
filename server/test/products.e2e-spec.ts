import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Product } from './../src/products/entities/product.entity.js';

// Checks that the product entities match the real tables (SQL Server must be running)
describe('Product entities (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('loads a product with its category, brand, variants and images', async () => {
    const repo = app.get(DataSource).getRepository(Product);
    const product = await repo.findOne({
      where: { slug: 'iphone-17-pro-max' },
      relations: { category: true, brand: true, variants: true, images: true },
    });

    expect(product?.name).toBe('iPhone 17 Pro Max');
    expect(product?.category.slug).toBe('dien-thoai');
    expect(product?.brand.slug).toBe('apple');
    expect(product?.variants).toHaveLength(4);
    expect(product?.images).toHaveLength(3);
    // Transformers: JSON text -> object, DECIMAL -> number
    expect(product?.specs?.chip).toBe('Apple A19 Pro');
    expect(typeof product?.variants[0]?.price).toBe('number');
  });

  it('GET /api/v1/products filters by category and sorts by price', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products?category=laptop&sort=price_asc')
      .expect(200);

    expect(res.body.total).toBe(9);
    const prices = res.body.items.map(
      (item: { fromPrice: number }) => item.fromPrice,
    );
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('GET /api/v1/products/:slug returns 404 for an unknown product', () => {
    return request(app.getHttpServer())
      .get('/api/v1/products/khong-ton-tai')
      .expect(404);
  });

  it('DELETE a category that still has products returns 409, not 500', () => {
    return request(app.getHttpServer())
      .delete('/api/v1/categories/1')
      .expect(409)
      .expect((res) => {
        expect(res.body.message).toBe(
          'Không thể xoá vì dữ liệu đang được sử dụng',
        );
      });
  });
});
