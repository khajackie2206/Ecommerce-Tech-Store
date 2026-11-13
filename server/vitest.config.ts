import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // npm run test:cov: which lines of src/ did the unit tests run?
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Not business logic: bootstrapping, module wiring, plain data shapes
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/swagger.ts',
        'src/**/*.module.ts',
        'src/**/*.entity.ts',
        'src/**/*.dto.ts',
      ],
      reporter: ['text', 'html'], // table in the terminal + coverage/index.html
    },
  },
});
