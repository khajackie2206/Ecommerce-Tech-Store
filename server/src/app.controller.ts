import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService, type ApiInfo, type HealthStatus } from './app.service.js';
import { Public } from './auth/decorators/public.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // GET /api/v1 - basic API information
  @Public()
  @Get()
  getInfo(): ApiInfo {
    return this.appService.getInfo();
  }

  // GET /api/v1/health - 200 when the database is reachable, 503 otherwise.
  // Docker and load balancers use this to know whether the API is ready.
  @Public()
  @Get('health')
  async getHealth(): Promise<HealthStatus> {
    const health = await this.appService.checkHealth();
    if (health.status !== 'ok') throw new ServiceUnavailableException(health);
    return health;
  }
}
