import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { Request } from 'express';
import type { StorageEngine } from 'multer';
import {
  FILES_SUBDIR,
  getStorageDir,
  resolveStoragePath,
  TMP_SUBDIR,
} from './meeting-file.config.js';
import {
  getMaxFileSize,
  sanitizeFileName,
  type AllowedType,
} from './meeting-file.types.js';
import {
  PREFIX_BYTES,
  resolveAllowedType,
  validateFile,
  validatePrefix,
} from './meeting-file.validator.js';

/** Что multer кладёт в `file` после сохранения. */
export interface StoredFileInfo {
  storageKey: string;
  size: number;
  /** MIME, определённый сервером. */
  mimetype: string;
  /** Очищенное исходное имя. */
  originalname: string;
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
    const originalname = sanitizeFileName(file.originalname);
    // Неподдерживаемое расширение отклоняется до записи на диск.
    const type = resolveAllowedType(originalname);
    const root = getStorageDir();
    const id = randomUUID();
    const tmpPath = path.join(root, TMP_SUBDIR, id);
    const storageKey = `${FILES_SUBDIR}/${id}`;
    await mkdir(path.join(root, TMP_SUBDIR), { recursive: true });
    await mkdir(path.join(root, FILES_SUBDIR), { recursive: true });
    // Вручную, а не через pipeline: pipeline уничтожает исходный поток с ошибкой, а multer
    // принимает эту ошибку (AbortError) вместо нашей причины (413/415).
    const out = createWriteStream(tmpPath, { flags: 'wx', mode: 0o600 });
    let writeError: unknown;
    out.on('error', (error) => {
      writeError = error;
    });
    try {
      for await (const chunk of guardStream(file.stream, type)) {
        if (writeError) throw writeError;
        if (!out.write(chunk)) await once(out, 'drain');
      }
      if (writeError) throw writeError;
      out.end();
      await finished(out);
      await validateFile(tmpPath, type);
      await rename(tmpPath, resolveStoragePath(storageKey));
    } catch (error) {
      out.destroy();
      file.stream.resume();
      await rm(tmpPath, { force: true });
      throw error;
    }
    const { size } = await stat(resolveStoragePath(storageKey));
    return { storageKey, size, mimetype: type.mime, originalname };
  }
}

/** Считает размер (лимит → 413) и проверяет сигнатуру по первому чанку, пока файл ещё пишется. */
async function* guardStream(
  source: Readable,
  type: AllowedType,
): AsyncGenerator<Buffer> {
  const max = getMaxFileSize();
  let total = 0;
  let prefix = Buffer.alloc(0);
  let prefixChecked = false;
  // Без destroyOnReturn: иначе поток уничтожается с AbortError, и multer примет его вместо нашей ошибки.
  const chunks = source.iterator({
    destroyOnReturn: false,
  }) as AsyncIterable<Buffer>;
  for await (const chunk of chunks) {
    total += chunk.length;
    if (total > max) {
      throw new PayloadTooLargeException(
        `Файл слишком большой. Максимальный размер — ${Math.round(max / 1024 / 1024)} МБ`,
      );
    }
    if (!prefixChecked) {
      prefix = Buffer.concat([prefix, chunk]);
      if (prefix.length >= PREFIX_BYTES) {
        await validatePrefix(prefix, type);
        prefixChecked = true;
        prefix = Buffer.alloc(0);
      }
    }
    yield chunk;
  }
  if (total === 0) throw new BadRequestException('Файл пустой');
  if (!prefixChecked) await validatePrefix(prefix, type);
}
