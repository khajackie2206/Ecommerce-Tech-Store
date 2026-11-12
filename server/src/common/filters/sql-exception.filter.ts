import {
  BadRequestException,
  Catch,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';

// SQL Server error numbers we turn into friendly HTTP errors
const DUPLICATE_KEY = [2627, 2601]; // UNIQUE constraint / unique index
const CONSTRAINT_CONFLICT = 547; // FOREIGN KEY or CHECK constraint

// Runs whenever a database query fails anywhere in the app.
// Without it the client gets "500 Internal server error" for every database problem.
@Catch(QueryFailedError)
export class SqlExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SqlExceptionFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpError = this.toHttpException(exception);
    // Same body as NestJS's own errors: { message, error, statusCode }
    response.status(httpError.getStatus()).json(httpError.getResponse());
  }

  private toHttpException(exception: QueryFailedError): HttpException {
    // The mssql driver puts the SQL Server error number in driverError.number
    const driverError = exception.driverError as {
      number?: number;
      message?: string;
    };
    const errorNumber = driverError.number;
    const sqlMessage = driverError.message ?? '';

    if (errorNumber !== undefined && DUPLICATE_KEY.includes(errorNumber)) {
      return new ConflictException('Dữ liệu đã tồn tại');
    }
    if (errorNumber === CONSTRAINT_CONFLICT) {
      // 547 covers several cases: read the message to tell them apart
      if (sqlMessage.includes('REFERENCE constraint')) {
        // DELETE of a row other rows still point to (a category with products)
        return new ConflictException(
          'Không thể xoá vì dữ liệu đang được sử dụng',
        );
      }
      if (sqlMessage.includes('FOREIGN KEY constraint')) {
        // INSERT/UPDATE pointing to a row that does not exist (categoryId = 999)
        return new BadRequestException('Dữ liệu liên quan không tồn tại');
      }
      // CHECK constraint, e.g. salePrice greater than price
      return new BadRequestException('Dữ liệu không hợp lệ');
    }

    // Unexpected: log everything for developers, reveal nothing to the client
    this.logger.error(exception.message, exception.stack);
    return new InternalServerErrorException('Lỗi cơ sở dữ liệu');
  }
}