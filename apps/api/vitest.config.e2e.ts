import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { TEST_DATABASE_URL } from './test/test-database.js';
import { TEST_AVATARS_DIR, TEST_STORAGE_DIR } from './test/test-storage.js';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      FILES_STORAGE_DIR: TEST_STORAGE_DIR,
      AVATARS_STORAGE_DIR: TEST_AVATARS_DIR,
      // Тесты регистрируются и входят десятки раз с одного IP.
      AUTH_RATE_LIMIT: '100000',
      RATE_LIMIT: '100000',
      TRANSCRIPTION_RETRY_RATE_LIMIT: '5',
    },
    // Все файлы работают с одной БД, поэтому запускаем их последовательно.
    fileParallelism: false,
  },
});
