import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { BrandsModule } from './brands/brands.module.js';

@Module({
  imports: [
    // Load environment variables once and make ConfigService available everywhere.
    // Locally the single .env file lives in the repo root (one level above server/).
    // Inside Docker, variables come from docker-compose instead of a file.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),

    // SQL Server connection, built from the config above
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mssql',
        host: config.getOrThrow<string>('DB_HOST'),
        port: Number(config.get('DB_PORT', 1433)),
        username: config.getOrThrow<string>('DB_USERNAME'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_NAME'),
        options: {
          encrypt: true,
          // Local SQL Server uses a self-signed certificate. Never trust it blindly in production.
          trustServerCertificate: true,
          // The database stores UTC (SYSUTCDATETIME()). TypeORM's default for SQL Server
          // is local time, which would shift every date by the machine's UTC offset.
          useUTC: true,
        },
        // Register every entity listed in TypeOrmModule.forFeature() automatically
        autoLoadEntities: true,
        // Create/alter tables to match entities on startup. Local learning only:
        // it can drop columns and lose data. Production uses migrations instead.
        synchronize: config.get('DB_SYNCHRONIZE') === 'true',
      }),
    }),

    BrandsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
