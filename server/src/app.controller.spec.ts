import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  // Fake TypeORM connection, so unit tests run without SQL Server
  const fakeDataSource = { query: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: DataSource, useValue: fakeDataSource },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('returns the API name and version', () => {
    expect(appController.getInfo()).toMatchObject({
      name: 'TechStore API',
      version: '0.1.0',
    });
  });

  it('reports the database as up when the query succeeds', async () => {
    fakeDataSource.query.mockResolvedValue([{ '': 1 }]);
    await expect(appController.getHealth()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('returns 503 when the database is unreachable', async () => {
    fakeDataSource.query.mockRejectedValue(new Error('connection refused'));
    await expect(appController.getHealth()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
