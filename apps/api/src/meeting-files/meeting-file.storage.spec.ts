import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { Request } from 'express';
import { samples } from '../../test/sample-files.js';
import { MeetingFileStorage } from './meeting-file.storage.js';

describe('MeetingFileStorage', () => {
  let dir: string;
  const storage = new MeetingFileStorage();

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'mf-storage-'));
    process.env.FILES_STORAGE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.FILES_STORAGE_DIR;
    delete process.env.MEETING_FILE_MAX_SIZE;
    await rm(dir, { recursive: true, force: true });
  });

  const handle = (name: string, content: Buffer) =>
    new Promise<{ error?: unknown; info?: Record<string, unknown> }>(
      (resolve) => {
        const file = {
          originalname: name,
          stream: Readable.from([content]),
        } as unknown as Express.Multer.File;
        storage._handleFile({} as Request, file, (error, info) =>
          resolve({ error: error ?? undefined, info }),
        );
      },
    );

  const leftovers = async () =>
    (
      await Promise.all(
        ['tmp', 'files'].map((d) =>
          readdir(path.join(dir, d)).catch(() => [] as string[]),
        ),
      )
    ).flat();

  it('сохраняет корректный файл под серверным именем и возвращает MIME и очищенное имя', async () => {
    const { info } = await handle('../../x/запись.mp4', samples.mp4());

    expect(info).toMatchObject({
      mimetype: 'video/mp4',
      originalname: 'запись.mp4',
      size: samples.mp4().length,
    });
    expect(info?.storageKey).toMatch(/^files\/[0-9a-f-]{36}$/);
    expect(await readdir(path.join(dir, 'tmp'))).toEqual([]);
  });

  it('недопустимое расширение: 415 и ничего не пишется на диск', async () => {
    const { error } = await handle('a.exe', samples.exe());

    expect(error).toBeInstanceOf(UnsupportedMediaTypeException);
    expect(await leftovers()).toEqual([]);
  });

  it('несоответствие содержимого: 415, tmp-файл удалён', async () => {
    const { error } = await handle('a.mp4', samples.exe());

    expect(error).toBeInstanceOf(UnsupportedMediaTypeException);
    expect(await leftovers()).toEqual([]);
  });

  it('превышение лимита: 413, tmp-файл удалён', async () => {
    process.env.MEETING_FILE_MAX_SIZE = '100';
    const { error } = await handle(
      'a.mp4',
      Buffer.concat([samples.mp4(), Buffer.alloc(500)]),
    );

    expect(error).toBeInstanceOf(PayloadTooLargeException);
    expect(await leftovers()).toEqual([]);
  });

  it('обрыв потока: ошибка пробрасывается, tmp-файл удалён', async () => {
    const stream = new Readable({ read() {} });
    stream.push(samples.mp4());
    const result = new Promise<unknown>((resolve) =>
      storage._handleFile(
        {} as Request,
        { originalname: 'a.mp4', stream } as unknown as Express.Multer.File,
        (error) => resolve(error),
      ),
    );
    setTimeout(() => stream.destroy(new Error('aborted')), 50);

    expect(await result).toBeInstanceOf(Error);
    expect(await leftovers()).toEqual([]);
  });

  it('_removeFile удаляет записанный файл', async () => {
    const { info } = await handle('a.mp4', samples.mp4());
    await new Promise<void>((resolve) =>
      storage._removeFile(
        {} as Request,
        info as unknown as Express.Multer.File,
        () => resolve(),
      ),
    );

    expect(await readdir(path.join(dir, 'files'))).toEqual([]);
  });
});
