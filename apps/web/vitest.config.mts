import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Файлы с компонентами/DOM помечаются `// @vitest-environment jsdom`; чистая логика идёт в node.
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
    clearMocks: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: { tsconfigPaths: true },
});
