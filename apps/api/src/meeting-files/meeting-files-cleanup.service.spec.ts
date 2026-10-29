import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { MeetingsService } from '../meetings/meetings.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MeetingFilesCleanupService } from './meeting-files-cleanup.service.js';
import type { TranscriptionQueue } from './transcription/transcription-queue.js';

describe('MeetingFilesCleanupService', () => {
  let dir: string;
  const id = (n: number) => `0000000${n}-0000-0000-0000-000000000000`;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'mf-cleanup-'));
    process.env.FILES_STORAGE_DIR = dir;
    await mkdir(path.join(dir, 'files'));
    await mkdir(path.join(dir, 'tmp'));
  });

  afterEach(async () => {
    delete process.env.FILES_STORAGE_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  const put = (sub: string, name: string) =>
    writeFile(path.join(dir, sub, name), 'x');
  const list = (sub: string) => readdir(path.join(dir, sub));

  const makeService = (
    records: { id: string; meetingId: string; storageKey: string }[],
    liveMeetings: string[],
  ) => {
    const findMany = vi.fn().mockImplementation(() => Promise.resolve(records));
    const deleteMany = vi
      .fn()
      .mockImplementation(({ where }: { where: { id: string } }) => {
        const i = records.findIndex((r) => r.id === where.id);
        if (i >= 0) records.splice(i, 1);
        return Promise.resolve({ count: 1 });
      });
    const prisma = { meetingFile: { findMany, deleteMany } };
    const meetings = { exists: (m: string) => liveMeetings.includes(m) };
    const recover = vi.fn().mockResolvedValue(0);
    return {
      deleteMany,
      recover,
      service: new MeetingFilesCleanupService(
        prisma as unknown as PrismaService,
        meetings as unknown as MeetingsService,
        { recover } as unknown as TranscriptionQueue,
      ),
    };
  };

  it('удаляет запись и файл, если встречи нет в памяти', async () => {
    await put('files', id(1));
    const { service, deleteMany } = makeService(
      [{ id: 'r1', meetingId: 'm1', storageKey: `files/${id(1)}` }],
      [],
    );

    const result = await service.cleanup();

    expect(result).toEqual({ orphanRecords: 1, orphanFiles: 0, tmpFiles: 0 });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'r1' } });
    expect(await list('files')).toEqual([]);
  });

  it('не трогает запись и файл, если встреча существует', async () => {
    await put('files', id(1));
    const { service, deleteMany } = makeService(
      [{ id: 'r1', meetingId: 'm1', storageKey: `files/${id(1)}` }],
      ['m1'],
    );

    const result = await service.cleanup();

    expect(result).toEqual({ orphanRecords: 0, orphanFiles: 0, tmpFiles: 0 });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(await list('files')).toEqual([id(1)]);
  });

  it('удаляет файлы без записи в БД', async () => {
    await put('files', id(1));
    await put('files', id(2));
    const { service } = makeService(
      [{ id: 'r1', meetingId: 'm1', storageKey: `files/${id(1)}` }],
      ['m1'],
    );

    const result = await service.cleanup();

    expect(result.orphanFiles).toBe(1);
    expect(await list('files')).toEqual([id(1)]);
  });

  it('очищает хвосты tmp', async () => {
    await put('tmp', id(1));
    await put('tmp', id(2));
    const { service } = makeService([], []);

    expect((await service.cleanup()).tmpFiles).toBe(2);
    expect(await list('tmp')).toEqual([]);
  });

  it('не трогает файлы с чужими именами (не uuid)', async () => {
    await put('files', 'README.txt');
    await put('tmp', '.gitkeep');
    const { service } = makeService([], []);

    const result = await service.cleanup();

    expect(result).toEqual({ orphanRecords: 0, orphanFiles: 0, tmpFiles: 0 });
    expect(await list('files')).toEqual(['README.txt']);
    expect(await list('tmp')).toEqual(['.gitkeep']);
  });

  it('работает, если каталогов хранилища ещё нет', async () => {
    await rm(dir, { recursive: true, force: true });
    const { service } = makeService([], []);

    await expect(service.cleanup()).resolves.toEqual({
      orphanRecords: 0,
      orphanFiles: 0,
      tmpFiles: 0,
    });
  });

  it('запись без файла на диске всё равно удаляется', async () => {
    const { service } = makeService(
      [{ id: 'r1', meetingId: 'm1', storageKey: `files/${id(1)}` }],
      [],
    );

    expect((await service.cleanup()).orphanRecords).toBe(1);
  });

  it('onApplicationBootstrap не падает при ошибке БД', async () => {
    const prisma = {
      meetingFile: {
        findMany: vi.fn().mockRejectedValue(new Error('db down')),
      },
    };
    const service = new MeetingFilesCleanupService(
      prisma as unknown as PrismaService,
      { exists: () => false } as unknown as MeetingsService,
      { recover: vi.fn() } as unknown as TranscriptionQueue,
    );

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('ошибка чтения каталога (не ENOENT) не прячется', async () => {
    // files — не каталог: readdir падает с ENOTDIR
    await rm(path.join(dir, 'files'), { recursive: true });
    await writeFile(path.join(dir, 'files'), 'x');
    const { service } = makeService([], []);

    await expect(service.cleanup()).rejects.toThrow();
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('onApplicationBootstrap возобновляет транскрибацию после очистки', async () => {
    const { service, deleteMany, recover } = makeService(
      [{ id: 'r1', meetingId: 'm1', storageKey: `files/${id(1)}` }],
      [],
    );
    recover.mockImplementation(() => {
      // К моменту восстановления запись без встречи уже удалена.
      expect(deleteMany).toHaveBeenCalledTimes(1);
      return Promise.resolve(2);
    });

    await service.onApplicationBootstrap();

    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('сбой очистки не мешает возобновить транскрибацию, а сбой возобновления не падает', async () => {
    await rm(path.join(dir, 'files'), { recursive: true });
    await writeFile(path.join(dir, 'files'), 'x');
    const { service, recover } = makeService([], []);
    recover.mockRejectedValue(new Error('db down'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(recover).toHaveBeenCalledTimes(1);
  });
});
