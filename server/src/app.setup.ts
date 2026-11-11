import { ValidationPipe, type INestApplication } from '@nestjs/common';

// App-wide settings shared by main.ts and the e2e tests,
// so tests run the API exactly the way production does.
export function configureApp(app: INestApplication): void {
  // Every route is served under /api/v1, e.g. GET /api/v1/products
  app.setGlobalPrefix('api/v1');

  // Validate every request body / query against its DTO class
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties that have no decorator in the DTO
      forbidNonWhitelisted: true, // ...and reject the request (400) when such properties are sent
      transform: true, // turn the plain JSON into an instance of the DTO class
    }),
  );
}