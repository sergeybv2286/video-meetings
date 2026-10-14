import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom для всех тестов: компонентный тест без отдельной пометки не должен падать на `document`.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
    clearMocks: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: { tsconfigPaths: true },
});
