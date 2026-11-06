import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

// Response of GET /api/v1
export interface ApiInfo {
  name: string;
  version: string;
  time: string;
}

// Response of GET /api/v1/health
export interface HealthStatus {
  status: 'ok' | 'error';
  database: 'up' | 'down';
}

@Injectable()
export class AppService {
  // DataSource is the TypeORM connection, provided by TypeOrmModule
  constructor(private readonly dataSource: DataSource) {}

  getInfo(): ApiInfo {
    return {
      name: 'TechStore API',
      version: '0.1.0',
      time: new Date().toISOString(), // always return UTC; the client converts to local time
    };
  }

  async checkHealth(): Promise<HealthStatus> {
    try {
      // The cheapest possible query: proves we can reach SQL Server and log in
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', database: 'up' };
    } catch {
      return { status: 'error', database: 'down' };
    }
  }
}
