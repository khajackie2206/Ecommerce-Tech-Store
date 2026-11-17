import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Order } from './../src/orders/entities/order.entity.js';
import { ProductVariant } from './../src/products/entities/product-variant.entity.js';
import { User } from './../src/users/user.entity.js';
import { bearer } from './auth-helper.js';

// Places real orders in SQL Server, then removes them and puts the stock back,
// so the test can run again and again without draining the sample data.
describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let token: string;
  let variant: ProductVariant; // a variant with plenty of stock
  const email = `orders-e2e-${Date.now()}@test.local`;
  const shipping = {
    shippingName: 'Người Test',
    shippingPhone: '0901234567',
    shippingAddress: '1 Đường Test, TP.HCM',
  };

  const placeOrder = (variantId: number, quantity: number) =>
    request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ variantId, quantity }], ...shipping });

  const stockOf = async (id: number) =>
    (await dataSource.getRepository(ProductVariant).findOneByOrFail({ id }))
      .stock;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);

    // A real customer account, so the order has a real userId (FK_Orders_Users)
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'matkhau123', fullName: 'Người Test' });
    token = res.body.accessToken;

    variant = await dataSource
      .getRepository(ProductVariant)
      .findOneByOrFail({ sku: 'SS-TA25W-WHT' }); // 25W charger, 120 in stock
  });

  // Each test starts from the same stock, whatever the previous test did
  beforeEach(async () => {
    await dataSource
      .getRepository(ProductVariant)
      .update({ id: variant.id }, { stock: 50 });
  });

  afterAll(async () => {
    // Undo everything this test did: delete its orders and user, restore the stock
    const user = await dataSource.getRepository(User).findOneBy({ email });
    if (user) {
      // OrderItems go too: FK_OrderItems_Orders has ON DELETE CASCADE
      await dataSource.getRepository(Order).delete({ userId: user.id });
      await dataSource.getRepository(User).delete({ id: user.id });
    }
    await dataSource
      .getRepository(ProductVariant)
      .update({ id: variant.id }, { stock: variant.stock });
    await app.close();
  });

  it('POST /orders saves the order and takes the stock', async () => {
    const before = await stockOf(variant.id);

    const res = await placeOrder(variant.id, 2).expect(201);

    expect(res.body.code).toMatch(/^TS\d{6}[0-9A-Z]{6}$/);
    expect(res.body.status).toBe('pending');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(res.body.subtotal + res.body.shippingFee);
    expect(await stockOf(variant.id)).toBe(before - 2);
  });

  it('POST /orders without a token returns 401', () => {
    return request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({ items: [{ variantId: variant.id, quantity: 1 }], ...shipping })
      .expect(401);
  });

  it('POST /orders asking for more than the stock returns 409 and takes nothing', async () => {
    await dataSource
      .getRepository(ProductVariant)
      .update({ id: variant.id }, { stock: 3 });

    const res = await placeOrder(variant.id, 5).expect(409);

    expect(res.body.message).toContain('chỉ còn 3 sản phẩm');
    expect(await stockOf(variant.id)).toBe(3);
  });

  it('GET /orders lists my orders, newest first', async () => {
    const placed = await placeOrder(variant.id, 1).expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/orders?limit=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.items[0].code).toBe(placed.body.code);
    expect(res.body.items[0].items).toHaveLength(1);
    expect(res.body).toMatchObject({ page: 1, limit: 5 });
  });

  it("GET /orders/:code of someone else's order returns 404", async () => {
    const placed = await placeOrder(variant.id, 1).expect(201);
    // Another logged-in customer (token signed by the app, see auth-helper.ts)
    const stranger = await bearer(app, 'customer');

    await request(app.getHttpServer())
      .get(`/api/v1/orders/${placed.body.code}`)
      .set('Authorization', stranger)
      .expect(404);
  });

  it('PATCH /orders/:code/cancel gives the stock back, and only once', async () => {
    const before = await stockOf(variant.id);
    const placed = await placeOrder(variant.id, 2).expect(201);
    expect(await stockOf(variant.id)).toBe(before - 2);

    const cancel = () =>
      request(app.getHttpServer())
        .patch(`/api/v1/orders/${placed.body.code}/cancel`)
        .set('Authorization', `Bearer ${token}`);

    const res = await cancel().expect(200);
    expect(res.body.status).toBe('cancelled');
    expect(await stockOf(variant.id)).toBe(before);

    await cancel().expect(409); // already cancelled: no second refund of stock
    expect(await stockOf(variant.id)).toBe(before);
  });

  it('two customers buying the last unit at the same time: only one wins', async () => {
    // Leave exactly 1 unit, then fire two orders at once
    await dataSource
      .getRepository(ProductVariant)
      .update({ id: variant.id }, { stock: 1 });

    const results = await Promise.all([
      placeOrder(variant.id, 1),
      placeOrder(variant.id, 1),
    ]);

    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(await stockOf(variant.id)).toBe(0); // never negative
  });
});
