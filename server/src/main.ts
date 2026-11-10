import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { setupSwagger } from './swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix and validation (shared with the e2e tests)
  configureApp(app);

  // Run shutdown hooks (e.g. close the SQL Server connection) on Ctrl+C or SIGTERM
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);

  // API docs for development only: production should not advertise every endpoint
  if (config.get('NODE_ENV') !== 'production') {
    setupSwagger(app);
    Logger.log(`API docs at http://localhost:${port}/api/docs`, 'Bootstrap');
  }

  await app.listen(port);
  Logger.log(`API is running at http://localhost:${port}/api/v1`, 'Bootstrap');
}
await bootstrap();