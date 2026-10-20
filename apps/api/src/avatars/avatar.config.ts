import path from 'node:path';

/** Каталог файлов аватаров (`AVATARS_STORAGE_DIR`, по умолчанию `./storage/avatars`). */
export function getAvatarStorageDir(): string {
  return path.resolve(process.env.AVATARS_STORAGE_DIR ?? './storage/avatars');
}

/**
 * Абсолютный путь по относительному ключу аватара.
 * Результат всегда внутри каталога аватаров.
 */
export function resolveAvatarPath(storageKey: string): string {
  const root = getAvatarStorageDir();
  const full = path.resolve(root, storageKey);
  if (!full.startsWith(root + path.sep)) {
    throw new Error('Недопустимый путь к файлу');
  }
  return full;
}
