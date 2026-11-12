// Commit message rules, checked by the commit-msg hook (.husky/commit-msg).
// Format: <type>(<scope>): <subject> (#<issue>)
// Example: feat(categories): reject duplicate slugs (#16)
// See CONTRIBUTING.md for the full convention.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'test', 'docs', 'style', 'perf', 'chore', 'ci', 'build', 'revert'],
    ],
    // Scope is optional, but when present it must be one of the project areas
    'scope-enum': [
      2,
      'always',
      [
        'auth', 'users', 'categories', 'brands', 'products', 'cart', 'orders',
        'admin', 'uploads', 'reports', 'db', 'web', 'server', 'docs', 'deps', 'ci', 'docker',
      ],
    ],
    // Allow any letter case in the subject (proper names like NestJS, SQL Server)
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
    // Every task is a GitHub issue: warn (not block) when the commit names none
    'references-empty': [1, 'never'],
  },
};
