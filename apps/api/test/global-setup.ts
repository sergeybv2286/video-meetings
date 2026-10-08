import { execFileSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './test-database.js';

/** Применяет миграции к тестовой БД (Prisma создаёт её, если её нет). */
export default function setup() {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
