import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService, type ApiInfo, type HealthStatus } from './app.service.js';
import { Public } from './auth/decorators/public.decorator.js';

@ApiTags('Hệ thống')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // GET /api/v1 - basic API information
  @Public()
  @ApiOperation({ summary: 'Tên và phiên bản API, giờ server (UTC)' })
  @Get()
  getInfo(): ApiInfo {
    return this.appService.getInfo();
  }

  // GET /api/v1/health - 200 when the database is reachable, 503 otherwise.
  // Docker and load balancers use this to know whether the API is ready.
  @Public()
  @ApiOperation({ summary: 'Kiểm tra API và kết nối SQL Server' })
  @Get('health')
  async getHealth(): Promise<HealthStatus> {
    const health = await this.appService.checkHealth();
    if (health.status !== 'ok') throw new ServiceUnavailableException(health);
    return health;
  }
}
