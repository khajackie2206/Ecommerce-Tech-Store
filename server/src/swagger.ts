import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Interactive API docs at http://localhost:3000/api/docs ("Try it out" sends real requests).
// The raw OpenAPI JSON is at /api/docs-json (Postman can import it).
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('TechStore API')
    .setDescription('API bán điện thoại, laptop (NestJS + SQL Server)')
    .setVersion('0.1.0')
    // Adds the "Authorize" button: paste a JWT once, every request sends it (from Part 7)
    .addBearerAuth()
    .addSecurityRequirements('bearer')
    .build();

  // Reads every controller, route and DTO and builds the OpenAPI description
  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // keep the pasted token after a page reload
      tagsSorter: 'alpha',
      operationsSorter: 'method',
    },
  });
}
