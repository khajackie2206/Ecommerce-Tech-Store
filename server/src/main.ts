import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Every route is served under /api/v1, e.g. GET /api/v1/products
  app.setGlobalPrefix('api/v1');

  // Run shutdown hooks (e.g. close the SQL Server connection) on Ctrl+C or SIGTERM
  app.enableShutdownHooks();

  const port = app.get(ConfigService).get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(`API is running at http://localhost:${port}/api/v1`, 'Bootstrap');
}
await bootstrap();
