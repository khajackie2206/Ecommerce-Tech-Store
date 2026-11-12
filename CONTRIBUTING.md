# Quy tắc làm việc với Git

Áp dụng cho mọi thành viên. Phần lớn quy tắc được **git hook tự kiểm tra** (husky). Nếu sai quy tắc, commit hoặc push sẽ bị chặn và có thông báo lý do.

## 0. Cài đặt (một lần cho mỗi máy)

```powershell
npm install        # ở thư mục gốc tech-store; script "prepare" sẽ bật git hook
```

Muốn biết hook đã chạy chưa: thử `git commit --allow-empty -m "abc"`. Nếu bị chặn là hook đã hoạt động.

## 1. Luồng làm một task

```powershell
git switch main
git pull                                    # luôn bắt đầu từ main mới nhất
git switch -c feat/16-sql-exception-filter  # nhánh mới cho issue #16
# ... code, commit nhiều lần ...
git push -u origin feat/16-sql-exception-filter
```

Sau đó mở Pull Request trên GitHub. Mô tả PR ghi `Closes #16` để issue tự đóng khi merge. Cần **1 người review approve** mới được merge. Merge xong thì xoá nhánh.

**Không push thẳng lên `main`.** Mọi thay đổi vào `main` đều phải đi qua Pull Request.

## 2. Tên nhánh

```
<loại>/<số-issue>-<mô-tả-ngắn>
```

- Dùng chữ thường, không dấu. Các từ nối bằng `-`, không dùng `#`, khoảng trắng hay chữ hoa.
- Nhánh `feat`, `fix`, `refactor`, `test` **bắt buộc** có số issue.
- Nhánh `docs`, `chore`, `ci`, `build` có thể không có số issue.

| Loại | Dùng khi | Ví dụ |
|---|---|---|
| `feat` | Thêm tính năng | `feat/17-jwt-login` |
| `fix` | Sửa lỗi | `fix/16-category-sort-order` |
| `refactor` | Đổi cấu trúc code, không đổi hành vi | `refactor/9-products-query-builder` |
| `test` | Chỉ thêm hoặc sửa test | `test/10-products-e2e` |
| `docs` | Tài liệu, bài học | `docs/update-lessons` |
| `chore` | Cấu hình, công cụ, dependency | `chore/git-conventions` |
| `ci` | GitHub Actions | `ci/43-github-actions` |

Đổi tên nhánh đặt sai: `git branch -m feat/16-ten-moi`

## 3. Commit message

Theo chuẩn [Conventional Commits](https://www.conventionalcommits.org/):

```
<loại>(<phạm-vi>): <mô tả ngắn> (#<số-issue>)
```

Ví dụ:

```
feat(categories): reject duplicate slugs (#16)
fix(products): return 404 with the slug in the message (#9)
test(products): add e2e tests for list and detail (#10)
docs: add lesson part 8
chore(deps): move class-validator into server/package.json
```

- **Loại**: giống bảng ở trên, có thêm `style` (chỉ định dạng code), `perf` (tối ưu tốc độ) và `revert`.
- **Phạm vi** (không bắt buộc): `auth`, `users`, `categories`, `brands`, `products`, `cart`, `orders`, `admin`, `uploads`, `reports`, `db`, `web`, `server`, `docs`, `deps`, `ci`, `docker`.
- **Mô tả**: viết tiếng Anh, thể mệnh lệnh (`add`, không viết `added`), không có dấu chấm cuối. Tối đa 100 ký tự cho cả dòng.
- **Số issue**: nên có. Nếu thiếu, hook sẽ cảnh báo nhưng không chặn.
- Mỗi commit làm **một việc**. Không gom "sửa linh tinh" vào một commit kiểu `update code`.

## 4. Trước khi push

Hook `pre-push` tự chạy theo thứ tự:

1. Kiểm tra tên nhánh, và chặn nếu push lên `main`.
2. `npm run lint`: oxlint cho server và web.
3. `npm test`: unit test của server.

Bước nào lỗi thì push bị huỷ. Sửa xong, push lại.

E2E test cần SQL Server nên hook không chạy. Nếu bạn sửa service hoặc controller, hãy tự chạy `npm run db:up` rồi `npm run test:e2e` trước khi mở PR.

## 5. Pull Request

- Tiêu đề PR viết giống commit message, ví dụ `feat(auth): JWT login (#17)`.
- Điền đủ template: làm gì, cách test, checklist.
- Có xung đột với `main` thì người mở PR tự xử lý: `git pull origin main` vào nhánh của mình, sửa xung đột rồi push lại.
- Người review phải chạy thử code, không chỉ đọc. Góp ý ghi thẳng vào dòng code trên GitHub.

## 6. Lưu ý

- `git commit --no-verify` hoặc `git push --no-verify` sẽ bỏ qua hook. **Không dùng**, trừ khi cả nhóm đồng ý.
- Không commit file `.env`, `node_modules`, `dist`, hay ảnh upload. Các file này đã có trong `.gitignore`.
