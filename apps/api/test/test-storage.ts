import os from 'node:os';
import path from 'node:path';

/** Отдельный каталог хранилища для e2e, чтобы тесты не трогали dev-файлы. */
export const TEST_STORAGE_DIR = path.join(
  os.tmpdir(),
  'video-meetings-e2e-storage',
);

/** Отдельный каталог аватаров для e2e. */
export const TEST_AVATARS_DIR = path.join(
  os.tmpdir(),
  'video-meetings-e2e-avatars',
);
