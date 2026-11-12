// Called by .husky/pre-push. Git writes one line per ref being pushed to stdin:
//   <local ref> <local sha> <remote ref> <remote sha>
// We block two things: pushing straight to main, and branch names that break
// the convention in CONTRIBUTING.md.
import { readFileSync } from 'node:fs';

const PROTECTED = new Set(['main']);
// <type>/<issue>-<short-description>, all lowercase, words joined by "-"
// feat and fix must name the issue; chore, docs, ci... may skip it.
const WITH_ISSUE = /^(feat|fix|refactor|test)\/\d+-[a-z0-9]+(-[a-z0-9]+)*$/;
const ISSUE_OPTIONAL = /^(docs|chore|ci|build)\/(\d+-)?[a-z0-9]+(-[a-z0-9]+)*$/;

const lines = readFileSync(0, 'utf8').split('\n').filter(Boolean);
const errors = [];

for (const line of lines) {
  const [, , remoteRef] = line.split(' ');
  // Only check branches; tags and other refs pass through
  if (!remoteRef?.startsWith('refs/heads/')) continue;
  const branch = remoteRef.slice('refs/heads/'.length);

  if (PROTECTED.has(branch)) {
    errors.push(
      `Không push thẳng lên "${branch}". Tạo nhánh mới, push nhánh đó rồi mở Pull Request.`,
    );
  } else if (!WITH_ISSUE.test(branch) && !ISSUE_OPTIONAL.test(branch)) {
    errors.push(
      `Tên nhánh "${branch}" sai quy tắc.\n` +
        '  Đúng:  feat/16-sql-exception-filter, fix/21-cart-total, chore/git-conventions\n' +
        '  Đổi tên nhánh hiện tại:  git branch -m <tên-mới>',
    );
  }
}

if (errors.length > 0) {
  console.error('\n[pre-push] Push bị chặn:\n');
  for (const error of errors) console.error(`- ${error}\n`);
  console.error('Xem quy tắc trong CONTRIBUTING.md\n');
  process.exit(1);
}
