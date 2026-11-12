import type { ArgumentsHost } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { SqlExceptionFilter } from './sql-exception.filter.js';

// Builds the error TypeORM throws, with a fake SQL Server driver error inside
function sqlError(number: number, message: string): QueryFailedError {
  return new QueryFailedError(
    'SQL',
    [],
    Object.assign(new Error(message), { number }),
  );
}

describe('SqlExceptionFilter', () => {
  const filter = new SqlExceptionFilter();

  // Fake Express response: records the status and body the filter sends
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;

  beforeEach(() => vi.clearAllMocks());

  it('turns a duplicate key (2627) into 409', () => {
    filter.catch(sqlError(2627, 'Violation of UNIQUE KEY constraint'), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Dữ liệu đã tồn tại' }),
    );
  });

  it('turns "row still in use" (547 REFERENCE) into 409', () => {
    filter.catch(
      sqlError(
        547,
        'The DELETE statement conflicted with the REFERENCE constraint "FK_Products_Categories"',
      ),
      host,
    );
    expect(status).toHaveBeenCalledWith(409);
  });

  it('turns a missing related row (547 FOREIGN KEY) into 400', () => {
    filter.catch(
      sqlError(
        547,
        'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_Products_Brands"',
      ),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Dữ liệu liên quan không tồn tại' }),
    );
  });

  it('turns a CHECK violation (547 CHECK) into 400', () => {
    filter.catch(
      sqlError(
        547,
        'The UPDATE statement conflicted with the CHECK constraint "CK_ProductVariants_salePrice"',
      ),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Dữ liệu không hợp lệ' }),
    );
  });

  it('hides unexpected database errors behind a 500', () => {
    filter.catch(sqlError(208, "Invalid object name 'Foo'"), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Lỗi cơ sở dữ liệu' }),
    );
  });
});
