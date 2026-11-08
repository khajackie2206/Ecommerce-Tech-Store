## Mục tiêu

Viết một **exception filter** bắt mọi lỗi database trong app và đổi thành phản hồi dễ hiểu, thay cho `500 Internal server error`:

| Lỗi SQL Server | Ví dụ | Trả về |
|---|---|---|
| 2627 / 2601 (trùng `UNIQUE`) | Hai danh mục cùng slug (lọt qua kiểm tra của service) | **409** "Dữ liệu đã tồn tại" |
| 547 + `REFERENCE constraint` | Xoá danh mục đang có sản phẩm | **409** "Không thể xoá vì dữ liệu đang được sử dụng" |
| 547 + `FOREIGN KEY constraint` | Tạo sản phẩm với `categoryId` không tồn tại | **400** "Dữ liệu liên quan không tồn tại" |
| 547 + `CHECK constraint` | `salePrice` lớn hơn `price` | **400** "Dữ liệu không hợp lệ" |
| Lỗi khác | Sai tên bảng, mất kết nối... | **500** "Lỗi cơ sở dữ liệu" (chi tiết chỉ ghi vào log) |

**Làm song song được** với task "Entity Product..." vì không đụng file nào chung.

**Đọc trước:** giáo trình Bài 8, mục 8.5 (xử lý lỗi); task "Đọc hiểu schema.sql" (Phần 4) có bảng mã lỗi.

## Vì sao 547 phải đọc thêm thông báo?

Ở Phần 4 bạn đã thấy: SQL Server dùng **chung mã 547** cho cả vi phạm khoá ngoại lẫn vi phạm `CHECK`, thậm chí khoá ngoại còn có hai hướng:
- `The DELETE statement conflicted with the REFERENCE constraint ...`: xoá dòng mà **dòng khác đang trỏ tới** → lỗi của thao tác, trả 409.
- `The INSERT statement conflicted with the FOREIGN KEY constraint ...`: thêm dòng trỏ tới **dòng không tồn tại** → dữ liệu gửi lên sai, trả 400.

Nên filter phải đọc thêm nội dung thông báo mới phân biệt được.

## Bước 1: Filter

Tạo `src/common/filters/sql-exception.filter.ts`:

```ts
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
```

Giải thích:
- `@Catch(QueryFailedError)`: filter chỉ nhận lỗi truy vấn của TypeORM. Lỗi khác (`NotFoundException`...) vẫn đi qua xử lý mặc định của NestJS.
- `exception.driverError`: lỗi gốc của driver `mssql`, chứa `number` (mã lỗi SQL Server) và `message`.
- Thay vì tự dựng JSON, ta tạo **exception có sẵn** của NestJS (`ConflictException`...) rồi gửi `getStatus()` và `getResponse()` của nó. Nhờ vậy lỗi database có **cùng định dạng** với mọi lỗi khác: `{ "message": ..., "error": "Conflict", "statusCode": 409 }`. Frontend chỉ cần xử lý một kiểu lỗi.
- Nhánh cuối ghi log đầy đủ (`exception.message`, `stack`) cho lập trình viên, nhưng client chỉ nhận "Lỗi cơ sở dữ liệu". **Không bao giờ** trả nguyên thông báo SQL ra ngoài: nó lộ tên bảng, tên cột.
- `import type { Response } from 'express'`: NestJS chạy trên Express, nên đối tượng response là của Express.

## Bước 2: Đăng ký cho toàn app

Trong `src/app.module.ts`, thêm 2 import:

```ts
import { APP_FILTER } from '@nestjs/core';
import { SqlExceptionFilter } from './common/filters/sql-exception.filter.js';
```

và đổi `providers` thành:

```ts
  providers: [
    AppService,
    // App-wide filter: turns SQL Server errors into friendly HTTP responses
    { provide: APP_FILTER, useClass: SqlExceptionFilter },
  ],
```

Đăng ký bằng `APP_FILTER` trong module (thay vì `app.useGlobalFilters(...)` trong `main.ts`) thì filter **có hiệu lực cả trong test e2e**, và có thể inject service nếu cần.

## Bước 3: Unit test cho cả 5 nhánh

Qua API hiện chỉ kích hoạt được nhánh "đang được sử dụng". Unit test kiểm tra cả 5 nhánh bằng lỗi giả mang đúng mã và đúng câu thông báo thật của SQL Server.

Tạo `src/common/filters/sql-exception.filter.spec.ts`:

```ts
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
```

- `new QueryFailedError('SQL', [], driverError)`: tạo đúng loại lỗi TypeORM ném ra; tham số thứ ba là lỗi giả của driver, có `number` và `message`.
- `host` giả chỉ có những gì filter dùng (`switchToHttp().getResponse().status().json()`). `as unknown as ArgumentsHost`: ép kiểu vì object giả không có đủ mọi thuộc tính của `ArgumentsHost` thật; chỉ dùng cách này trong test.
- Khi chạy test sẽ thấy một dòng log đỏ `Invalid object name 'Foo'`: đó là filter đang ghi log ở test nhánh 500, test vẫn **qua**.

## Bước 4: Test e2e

Thêm vào trong `describe` của `test/products.e2e-spec.ts` (nếu file chưa có, làm sau task "Entity Product..."):

```ts
  it('DELETE a category that still has products returns 409, not 500', () => {
    return request(app.getHttpServer())
      .delete('/api/v1/categories/1')
      .expect(409)
      .expect((res) => {
        expect(res.body.message).toBe(
          'Không thể xoá vì dữ liệu đang được sử dụng',
        );
      });
  });
```

## Bước 5: Gọi thử

```http
### Category 1 still has products -> 409 instead of 500
DELETE http://localhost:3000/api/v1/categories/1
```

Kết quả:

```json
{ "message": "Không thể xoá vì dữ liệu đang được sử dụng", "error": "Conflict", "statusCode": 409 }
```

## Kiểm tra

- [ ] Xoá danh mục 1 hoặc hãng 1 trả 409 với thông báo tiếng Việt
- [ ] `npm run lint`, `npm test` (thêm 5 test của filter), `npm run test:e2e` đều qua
- [ ] Giải thích được vì sao 547 cần đọc thêm thông báo, và vì sao không trả nguyên lỗi SQL cho client
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

Tạm xoá đoạn kiểm tra trùng slug `ensureSlugIsFree` trong `CategoriesService.create`, tạo danh mục slug `laptop`: lần này lỗi 2627 đi thẳng xuống database và filter trả 409 "Dữ liệu đã tồn tại". Đó là vì sao filter là **lưới an toàn cuối cùng**. Nhớ trả code lại như cũ.
