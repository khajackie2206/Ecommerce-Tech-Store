## Mục tiêu

Admin upload ảnh cho sản phẩm:

- `POST /api/v1/admin/products/:id/images`: gửi file (form `multipart/form-data`, field `file`). Server lưu file vào thư mục `server/uploads/products/` với tên ngẫu nhiên, thêm dòng `ProductImages`. Ảnh đầu tiên của sản phẩm chưa có ảnh đại diện sẽ thành `thumbnailUrl`.
- `DELETE /api/v1/admin/images/:id`: xoá dòng và xoá luôn file.
- Ảnh xem được ở `http://localhost:3000/uploads/products/<tên-file>`, và qua web ở `:5173` (Vite) hoặc `:8080` (Docker).

| Tình huống | Kết quả |
|---|---|
| PNG/JPG/WebP ≤ 2MB | **201** `{ id, productId, url: "/uploads/products/6dc0...png", sortOrder }` |
| File văn bản đổi tên thành `photo.jpg` | **400** "Chỉ nhận ảnh JPG, PNG hoặc WebP" |
| Ảnh 3MB | **400** "Ảnh tối đa 2MB" |
| File trên 5MB | **413** "File too large" (bị chặn trước khi đọc hết) |
| Không gửi file | **400** "Chưa chọn file ảnh" |

**Làm sau:** task "API admin: quản lý sản phẩm và phiên bản" (cùng sửa `products.module.ts`).

**Đọc trước:** tài liệu NestJS "File upload" (https://docs.nestjs.com/techniques/file-upload).

## Ảnh được lưu ở đâu?

Database chỉ lưu **đường dẫn** (`/uploads/products/abc.png`), còn file nằm trên ổ đĩa của server. Lưu cả file ảnh vào SQL Server (`VARBINARY`) cũng được, nhưng làm database phình to, sao lưu chậm, và mỗi lần xem ảnh lại phải đi qua database.

Dự án thật thường để ảnh trên dịch vụ lưu trữ riêng (Amazon S3, Cloudinary...). Ở đây lưu trên đĩa cho dễ học, và mọi chi tiết về thư mục được gom vào một service, sau này đổi sang S3 chỉ phải sửa chỗ đó.

Ba nguyên tắc an toàn khi nhận file từ người dùng:
1. **Kiểm tra nội dung, không tin tên file.** `virus.exe` đổi tên thành `photo.jpg` vẫn là file `.exe`. NestJS đọc vài byte đầu của file (gọi là *magic number*, mỗi loại file có chữ ký riêng: PNG luôn bắt đầu bằng `‰PNG`) để biết loại thật.
2. **Không dùng tên file của client.** Tên có thể chứa `../../` (ghi đè file khác), dấu cách, dấu tiếng Việt, hoặc trùng tên. Ta đặt tên mới bằng UUID.
3. **Giới hạn kích thước** ngay từ lúc nhận, trước khi file nằm hết trong bộ nhớ server.

## Bước 1: Thư viện và cấu hình TypeScript

`multer` (thư viện nhận file của Express) đã có sẵn trong `@nestjs/platform-express`. Chỉ cần thêm kiểu dữ liệu:

```powershell
cd server
npm install -D @types/multer
```

Trong `server/tsconfig.json`, thêm `"multer"` vào `types`:

```json
    "types": ["vitest/globals", "node", "multer"]
```

Dự án giới hạn các kiểu toàn cục trong danh sách `types`. Thiếu `"multer"` thì TypeScript báo `Namespace 'global.Express' has no exported member 'Multer'`.

## Bước 2: Service

Tạo `src/products/admin-images.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Repository } from 'typeorm';
import { ProductImage } from './entities/product-image.entity.js';
import { Product } from './entities/product.entity.js';

// The file types we accept and the extension we save them with
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// URL prefix the files are served under (see main.ts, vite.config.ts, nginx.conf)
export const UPLOADS_URL = '/uploads';

@Injectable()
export class AdminImagesService {
  // Folder on disk, e.g. server/uploads. Configurable so Docker can mount a volume there.
  private readonly uploadDir: string;

  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly imagesRepo: Repository<ProductImage>,
    config: ConfigService,
  ) {
    this.uploadDir = resolve(config.get('UPLOAD_DIR', 'uploads'));
  }

  // Save the uploaded file under a random name, then add the ProductImage row
  async add(
    productId: number,
    file: Express.Multer.File,
  ): Promise<ProductImage> {
    const product = await this.productsRepo.findOneBy({ id: productId });
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm id=${productId}`);
    }

    // Never reuse the client's file name: it can contain "../", spaces, accents,
    // or collide with another file. A UUID is unique and safe.
    const fileName = `${randomUUID()}.${EXTENSIONS[file.mimetype] ?? 'bin'}`;
    await mkdir(join(this.uploadDir, 'products'), { recursive: true });
    await writeFile(join(this.uploadDir, 'products', fileName), file.buffer);

    const count = await this.imagesRepo.countBy({ productId });
    const image = await this.imagesRepo.save(
      this.imagesRepo.create({
        productId,
        url: `${UPLOADS_URL}/products/${fileName}`,
        sortOrder: count + 1, // new images go last
      }),
    );

    // The first image of a product without a thumbnail becomes its thumbnail
    if (!product.thumbnailUrl) {
      await this.productsRepo.update(
        { id: productId },
        { thumbnailUrl: image.url },
      );
    }
    return image;
  }

  // Delete the row, then the file (only files we uploaded: seed images are external URLs)
  async remove(id: number): Promise<void> {
    const image = await this.imagesRepo.findOneBy({ id });
    if (!image) throw new NotFoundException(`Không tìm thấy ảnh id=${id}`);
    await this.imagesRepo.remove(image);

    if (image.url.startsWith(`${UPLOADS_URL}/`)) {
      const relative = image.url.slice(UPLOADS_URL.length + 1); // "products/x.jpg"
      await rm(join(this.uploadDir, relative), { force: true }); // force: no error if missing
    }
  }
}
```

Giải thích:
- `UPLOAD_DIR` (mặc định `uploads`): thư mục lưu file, tính từ thư mục chạy server. Không cần thêm vào `.env` nếu dùng mặc định. Docker sẽ gắn một volume vào đúng chỗ này (Bước 5).
- `file.buffer`: nội dung file nằm trong bộ nhớ (multer chạy chế độ *memory storage*, mặc định). Ta kiểm tra xong mới `writeFile` xuống đĩa. Nhờ vậy file sai loại không bao giờ chạm tới ổ đĩa.
- `randomUUID()`: tên file kiểu `6dc01429-2f04-4ef4-a697-ef0fd34f2429.png`, không trùng, không đoán được.
- `mkdir(..., { recursive: true })`: tạo thư mục nếu chưa có, không lỗi nếu đã có.
- `remove` chỉ xoá file nằm trong `/uploads/`: ảnh mẫu trong `seed.sql` là link `https://placehold.co/...`, không có file nào trên đĩa. `rm(..., { force: true })` không báo lỗi nếu file đã mất.

## Bước 3: Controller

Tạo `src/products/admin-images.controller.ts`:

```ts
import {
  BadRequestException,
  Controller,
  Delete,
  FileTypeValidator,
  HttpCode,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AdminImagesService } from './admin-images.service.js';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB: the shop's rule, clear error message
// Hard cap for multer: it stops reading bigger uploads (413 Payload Too Large),
// so a 1 GB file can't fill the server memory before our validators even run
const UPLOAD_HARD_LIMIT = 5 * 1024 * 1024;

@ApiTags('Admin: Sản phẩm')
@Roles('admin')
@Controller('admin')
export class AdminImagesController {
  constructor(private readonly adminImages: AdminImagesService) {}

  // multipart/form-data with one field "file" (like <input type="file" name="file">)
  @ApiOperation({ summary: 'Upload ảnh sản phẩm (JPG, PNG, WebP, tối đa 2MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiBadRequestResponse({
    description: 'Không có file, sai loại hoặc quá lớn',
  })
  @ApiNotFoundResponse({ description: 'Không có sản phẩm' })
  // FileInterceptor runs multer: it reads the "file" field into memory (file.buffer)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: UPLOAD_HARD_LIMIT } }),
  )
  @Post('products/:id/images')
  upload(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: MAX_IMAGE_SIZE,
            message: 'Ảnh tối đa 2MB',
          }),
          // Checks the real content (the first bytes of the file), not the name:
          // "virus.exe" renamed to "photo.jpg" is still rejected
          new FileTypeValidator({
            fileType: /^image\/(jpeg|png|webp)$/,
            errorMessage: 'Chỉ nhận ảnh JPG, PNG hoặc WebP',
          }),
        ],
        // The one message a validator can't set: no file was sent at all
        exceptionFactory: (error) =>
          new BadRequestException(
            error === 'File is required' ? 'Chưa chọn file ảnh' : error,
          ),
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.adminImages.add(id, file);
  }

  @ApiOperation({ summary: 'Xoá ảnh sản phẩm (xoá cả file đã upload)' })
  @ApiNotFoundResponse({ description: 'Không có ảnh' })
  @Delete('images/:id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.adminImages.remove(id);
  }
}
```

Giải thích:
- `@UseInterceptors(FileInterceptor('file', ...))`: chạy multer cho request này, đọc field `file` của form. Tên field phải khớp với frontend (`formData.append('file', ...)`).
- `@UploadedFile(new ParseFilePipe({...}))`: lấy file ra và chạy các validator:
  - `MaxFileSizeValidator`: quá 2MB → 400 kèm thông báo của ta.
  - `FileTypeValidator`: so loại **thật** (từ magic number) với biểu thức `/^image\/(jpeg|png|webp)$/`.
  - `exceptionFactory`: đổi câu "File is required" mặc định sang tiếng Việt; các lỗi khác giữ nguyên thông báo của validator.
- Hai lớp giới hạn kích thước: multer dừng đọc khi file vượt **5MB** (413, chặn file khổng lồ chiếm bộ nhớ); validator báo lỗi dễ hiểu ở **2MB** (400). `client_max_body_size 5m` trong `web/nginx.conf` cũng đặt đúng 5MB.
- `@ApiConsumes('multipart/form-data')` + `@ApiBody({ schema: { ... format: 'binary' } })`: Swagger hiện nút **Choose File** để thử upload ngay trên trang.

Trong `src/products/products.module.ts`, thêm `AdminImagesController` vào `controllers` và `AdminImagesService` vào `providers` (kèm 2 dòng import):

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminImagesController } from './admin-images.controller.js';
import { AdminImagesService } from './admin-images.service.js';
import { AdminProductsController } from './admin-products.controller.js';
import { AdminProductsService } from './admin-products.service.js';
import { AdminVariantsController } from './admin-variants.controller.js';
import { ProductImage } from './entities/product-image.entity.js';
import { ProductVariant } from './entities/product-variant.entity.js';
import { Product } from './entities/product.entity.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductVariant, ProductImage])],
  // Shop and admin share the same entities, so they live in the same module
  controllers: [
    ProductsController,
    AdminProductsController,
    AdminVariantsController,
    AdminImagesController,
  ],
  providers: [ProductsService, AdminProductsService, AdminImagesService],
})
export class ProductsModule {}
```

## Bước 4: Phục vụ file ở `/uploads`

File trên đĩa cần một URL để trình duyệt tải được. Thay toàn bộ `src/main.ts`:

```ts
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'node:path';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { setupSwagger } from './swagger.js';

async function bootstrap() {
  // NestExpressApplication: the Express flavour of the app, needed for useStaticAssets
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Global prefix and validation (shared with the e2e tests)
  configureApp(app);

  // Run shutdown hooks (e.g. close the SQL Server connection) on Ctrl+C or SIGTERM
  app.enableShutdownHooks();

  const config = app.get(ConfigService);

  // Uploaded product images: GET /uploads/products/<file> serves the file as is
  app.useStaticAssets(resolve(config.get('UPLOAD_DIR', 'uploads')), {
    prefix: '/uploads',
  });
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
```

- `NestFactory.create<NestExpressApplication>(...)`: khai báo app chạy trên Express, để dùng được `useStaticAssets`.
- `useStaticAssets(thư mục, { prefix: '/uploads' })`: request `GET /uploads/products/abc.png` được trả về nguyên file `uploads/products/abc.png`. Không qua controller, guard hay global prefix `/api/v1`.

Trình duyệt mở web ở `:5173` (Vite) hoặc `:8080` (nginx), nên hai nơi đó phải chuyển `/uploads` sang API giống như `/api`.

Trong `web/vite.config.ts`, thêm một dòng vào `proxy`:

```ts
    proxy: {
      '/api': 'http://localhost:3000',
      // Product images uploaded through the admin pages are served by the API too
      '/uploads': 'http://localhost:3000',
    },
```

Trong `web/nginx.conf`, thêm khối này **trước** `location / {`:

```nginx
  # Product images uploaded by the admin are files served by the API
  location /uploads/ {
    proxy_pass http://server:3000;
  }
```

## Bước 5: Docker và Git

Container bị xoá khi build lại, file bên trong mất theo. Ảnh phải nằm trên một **volume**, giống dữ liệu SQL Server.

Trong `docker-compose.yml`, thêm `volumes` cho service `server` và khai báo volume ở cuối file:

```yaml
  server:
    ...
    volumes:
      # Uploaded product images survive rebuilding the container
      - uploads-data:/app/uploads
    depends_on:
      ...

volumes:
  sqlserver-data:
  uploads-data:
```

Trong `server/Dockerfile`, thêm dòng `RUN` ngay **trước** `USER node`:

```dockerfile
# Folder for uploaded images, owned by the non-root user that writes into it.
# A volume mounted here (docker-compose.yml) starts with this owner.
RUN mkdir -p /app/uploads && chown node:node /app/uploads
# Never run as root inside the container
USER node
```

Thiếu dòng này, thư mục do `root` sở hữu và user `node` không ghi được: upload trả 500 `EACCES: permission denied`.

Trong `.gitignore` ở thư mục gốc, thêm:

```
# Uploaded files (local)
server/uploads/
```

## Bước 6: Test e2e

Tạo `test/admin-images.e2e-spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { bearer } from './auth-helper.js';

// The smallest valid PNG (1x1 pixel). Its first bytes are the PNG "magic number".
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

describe('Admin images (e2e)', () => {
  let app: INestApplication<App>;
  let admin: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    admin = await bearer(app, 'admin');
  });

  afterAll(async () => {
    await app.close();
  });

  it('uploads a PNG to product 1, then deletes it with its file', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/products/1/images')
      .set('Authorization', admin)
      .attach('file', PNG, 'photo.png') // multipart/form-data, field "file"
      .expect(201);

    expect(res.body.url).toMatch(/^\/uploads\/products\/[0-9a-f-]{36}\.png$/);
    const onDisk = resolve('uploads', res.body.url.slice('/uploads/'.length));
    expect(existsSync(onDisk)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/images/${res.body.id}`)
      .set('Authorization', admin)
      .expect(204);
    expect(existsSync(onDisk)).toBe(false);
  });

  it('rejects a text file renamed to .jpg (content is checked, not the name)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/products/1/images')
      .set('Authorization', admin)
      .attach('file', Buffer.from('not an image'), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);
    expect(res.body.message).toBe('Chỉ nhận ảnh JPG, PNG hoặc WebP');
  });

  it('rejects a request without a file', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/products/1/images')
      .set('Authorization', admin)
      .expect(400);
  });
});
```

- `.attach('file', buffer, 'photo.png')`: supertest gửi `multipart/form-data` như một form có `<input type="file" name="file">`.
- `PNG` là một ảnh 1×1 điểm ảnh viết dạng base64, đủ để có magic number thật.
- Test đầu upload rồi xoá ngay: kiểm tra file xuất hiện rồi biến mất trên đĩa, không để rác lại.

## Bước 7: Gọi thử trên Swagger

`npm run dev`, mở http://localhost:3000/api/docs, **Authorize** bằng token admin:

1. `POST /api/v1/admin/products/{id}/images` → **Try it out** → `id` = 1 → **Choose File** chọn một ảnh JPG trên máy → **Execute** → 201. Mở `http://localhost:5173` + `url` trả về (ví dụ `http://localhost:5173/uploads/products/6dc0....jpg`): thấy ảnh, đi qua proxy của Vite.
2. Thử một file `.txt` đổi đuôi thành `.jpg` → 400 "Chỉ nhận ảnh JPG, PNG hoặc WebP".
3. Thư mục `server/uploads/products/` có file mới; `git status` **không** hiện thư mục này.
4. `DELETE /api/v1/admin/images/{id}` → 204, file biến mất khỏi thư mục.

## Kiểm tra

- [ ] Upload ảnh thật → 201, xem được ảnh qua `:3000/uploads/...` và `:5173/uploads/...`
- [ ] File giả mạo, ảnh quá lớn, thiếu file đều bị từ chối với thông báo tiếng Việt
- [ ] Xoá ảnh xoá luôn file trên đĩa
- [ ] (Docker) `npm run app:up`, upload qua `:8080` thành công; `npm run app:down` rồi `app:up` lại, ảnh vẫn còn
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` đều qua
- [ ] Pull Request có dòng `Closes #<số issue này>`, đã được teammate review

## Tự luyện

1. `DELETE /admin/products/:id` (task trước) xoá dòng `ProductImages` theo `ON DELETE CASCADE`, nhưng file ảnh vẫn nằm lại trên đĩa. Sửa `AdminProductsService.remove` để xoá file của các ảnh đã upload sau khi transaction thành công.
2. Thêm `PATCH /admin/images/:id` nhận `{ "sortOrder": 1 }` để admin đổi thứ tự ảnh.
3. Vì sao xoá file **sau** khi xoá dòng trong database, chứ không làm ngược lại? (Gợi ý: nếu bước thứ hai lỗi, trường hợp nào để lại hậu quả tệ hơn?)
