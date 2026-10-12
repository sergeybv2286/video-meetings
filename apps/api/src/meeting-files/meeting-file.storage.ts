import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Request } from 'express';
import type { StorageEngine } from 'multer';
import {
  FILES_SUBDIR,
  getStorageDir,
  resolveStoragePath,
  TMP_SUBDIR,
} from './meeting-file.config.js';

/** Что multer кладёт в `file` после сохранения. */
export interface StoredFileInfo {
  storageKey: string;
  size: number;
}

/**
 * Потоковая запись на диск: `tmp/<uuid>` → атомарный `rename` в `files/<uuid>`.
 * Имя на диске генерирует сервер, исходное имя файла на путь не влияет.
 */
export class MeetingFileStorage implements StorageEngine {
  _handleFile(
    _req: Request,
    file: Express.Multer.File,
    cb: (error?: unknown, info?: Partial<Express.Multer.File>) => void,
  ): void {
    this.save(file)
      .then((info) => cb(null, info))
      .catch((error: unknown) => cb(error));
  }

  _removeFile(
    _req: Request,
    file: Express.Multer.File & Partial<StoredFileInfo>,
    cb: (error: Error | null) => void,
  ): void {
    if (!file.storageKey) return cb(null);
    rm(resolveStoragePath(file.storageKey), { force: true })
      .then(() => cb(null))
      .catch((error: Error) => cb(error));
  }

  private async save(file: Express.Multer.File): Promise<StoredFileInfo> {
    const root = getStorageDir();
    const id = randomUUID();
    const tmpPath = path.join(root, TMP_SUBDIR, id);
    const storageKey = `${FILES_SUBDIR}/${id}`;
    await mkdir(path.join(root, TMP_SUBDIR), { recursive: true });
    await mkdir(path.join(root, FILES_SUBDIR), { recursive: true });
    try {
      await pipeline(
        file.stream,
        createWriteStream(tmpPath, { flags: 'wx', mode: 0o600 }),
      );
      await rename(tmpPath, resolveStoragePath(storageKey));
    } catch (error) {
      await rm(tmpPath, { force: true });
      throw error;
    }
    const { size } = await stat(resolveStoragePath(storageKey));
    return { storageKey, size };
  }
}
