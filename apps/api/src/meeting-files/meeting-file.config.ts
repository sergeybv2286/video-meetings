import path from 'node:path';

/** Корневой каталог хранилища файлов встреч (`FILES_STORAGE_DIR`, по умолчанию `./storage`). */
export function getStorageDir(): string {
  return path.resolve(process.env.FILES_STORAGE_DIR ?? './storage');
}

/** Каталог файлов, загрузка которых ещё не завершена. */
export const TMP_SUBDIR = 'tmp';

/** Каталог готовых файлов. `tmp` и `files` лежат на одной ФС, поэтому `rename` атомарен. */
export const FILES_SUBDIR = 'files';

/**
 * Абсолютный путь по относительному ключу хранилища (`files/<uuid>`).
 * Результат всегда внутри корня хранилища.
 */
export function resolveStoragePath(storageKey: string): string {
  const root = getStorageDir();
  const full = path.resolve(root, storageKey);
  if (!full.startsWith(root + path.sep)) {
    throw new Error('Недопустимый путь к файлу');
  }
  return full;
}
