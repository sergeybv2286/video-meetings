import { ConflictException, NotFoundException } from '@nestjs/common';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MeetingFilesService } from './meeting-files.service.js';
import type { TranscriptionQueue } from './transcription/transcription-queue.js';

describe('MeetingFilesService', () => {
  let dir: string;
  const meetingId = '11111111-1111-1111-1111-111111111111';
  const row = {
    id: '22222222-2222-2222-2222-222222222222',
    meetingId,
    originalName: 'запись.mp4',
    mimeType: 'video/mp4',
    size: 3,
    status: 'UPLOADED' as const,
    storageKey: 'files/abc',
    uploadedAt: new Date('2026-10-12T10:00:00.000Z'),
  };

  const storedFile = {
    originalname: 'запись.mp4',
    mimetype: 'video/mp4',
    size: 3,
    storageKey: 'files/abc',
  } as Express.Multer.File & { storageKey: string };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'mf-unit-'));
    process.env.FILES_STORAGE_DIR = dir;
    await mkdir(path.join(dir, 'files'));
    await writeFile(path.join(dir, 'files', 'abc'), 'abc');
  });

  afterEach(async () => {
    delete process.env.FILES_STORAGE_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  const enqueue = vi.fn();
  const cancel = vi.fn();

  const makeService = (meetingFile: Record<string, unknown>) =>
    new MeetingFilesService(
      { meetingFile } as unknown as PrismaService,
      { enqueue, cancel } as unknown as TranscriptionQueue,
    );

  beforeEach(() => {
    enqueue.mockReset().mockResolvedValue('QUEUED');
    cancel.mockReset();
  });

  it('create сохраняет метаданные и не отдаёт storageKey', async () => {
    const create = vi.fn().mockResolvedValue(row);
    const dto = await makeService({ create }).create(meetingId, storedFile);

    expect(create).toHaveBeenCalledWith({
      data: {
        meetingId,
        originalName: 'запись.mp4',
        mimeType: 'video/mp4',
        size: 3,
        storageKey: 'files/abc',
      },
    });
    expect(dto).toEqual({
      id: row.id,
      meetingId,
      originalName: 'запись.mp4',
      mimeType: 'video/mp4',
      size: 3,
      status: 'UPLOADED',
      uploadedAt: '2026-10-12T10:00:00.000Z',
      transcriptionStatus: 'QUEUED',
    });
    expect(dto).not.toHaveProperty('storageKey');
    expect(enqueue).toHaveBeenCalledWith(row);
  });

  it('create: сбой постановки в очередь не отменяет загрузку', async () => {
    enqueue.mockRejectedValue(new Error('БД недоступна'));
    const create = vi.fn().mockResolvedValue(row);
    const dto = await makeService({ create }).create(meetingId, storedFile);

    expect(dto.transcriptionStatus).toBeNull();
    expect(await readdir(path.join(dir, 'files'))).toEqual(['abc']);
  });

  it('create: при дубликате (P2002) удаляет файл с диска и отдаёт 409', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const create = vi.fn().mockRejectedValue(error);

    await expect(
      makeService({ create }).create(meetingId, storedFile),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await readdir(path.join(dir, 'files'))).toEqual([]);
  });

  it('create: при другой ошибке БД удаляет файл и пробрасывает ошибку', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db down'));

    await expect(
      makeService({ create }).create(meetingId, storedFile),
    ).rejects.toThrow('db down');
    expect(await readdir(path.join(dir, 'files'))).toEqual([]);
  });

  it('create: сбой удаления файла не перекрывает исходную ошибку (409)', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const create = vi.fn().mockRejectedValue(error);
    // storageKey вне хранилища: resolveStoragePath бросает при очистке
    const outside = { ...storedFile, storageKey: '../outside' };

    await expect(
      makeService({ create }).create(meetingId, outside),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('findByMeeting возвращает метаданные', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue({ ...row, transcription: { status: 'DONE' } });
    const dto = await makeService({ findUnique }).findByMeeting(meetingId);

    expect(findUnique).toHaveBeenCalledWith({
      where: { meetingId },
      include: { transcription: { select: { status: true } } },
    });
    expect(dto.originalName).toBe('запись.mp4');
    expect(dto.transcriptionStatus).toBe('DONE');
  });

  it('findByMeeting: без транскрибации статус null', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue({ ...row, transcription: null });
    const dto = await makeService({ findUnique }).findByMeeting(meetingId);

    expect(dto.transcriptionStatus).toBeNull();
  });

  it('findByMeeting: 404, если файла нет', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);

    await expect(
      makeService({ findUnique }).findByMeeting(meetingId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('replace', () => {
    const newFile = {
      originalname: 'новая.mp4',
      mimetype: 'video/mp4',
      size: 5,
      storageKey: 'files/new',
    } as Express.Multer.File & { storageKey: string };
    const updatedRow = {
      ...row,
      originalName: 'новая.mp4',
      size: 5,
      storageKey: 'files/new',
    };

    beforeEach(async () => {
      await writeFile(path.join(dir, 'files', 'new'), 'новый');
    });

    it('обновляет метаданные условно по старому storageKey и удаляет старый файл', async () => {
      const findUnique = vi.fn().mockResolvedValue(row);
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const findUniqueOrThrow = vi.fn().mockResolvedValue(updatedRow);

      const dto = await makeService({
        findUnique,
        updateMany,
        findUniqueOrThrow,
      }).replace(meetingId, newFile);

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: row.id, storageKey: 'files/abc' },
        data: expect.objectContaining({
          originalName: 'новая.mp4',
          size: 5,
          storageKey: 'files/new',
        }),
      });
      expect(dto.originalName).toBe('новая.mp4');
      expect(dto).not.toHaveProperty('storageKey');
      expect(await readdir(path.join(dir, 'files'))).toEqual(['new']);
    });

    it('при ошибке БД старый файл остаётся, новый удаляется', async () => {
      const findUnique = vi.fn().mockResolvedValue(row);
      const updateMany = vi.fn().mockRejectedValue(new Error('db down'));

      await expect(
        makeService({ findUnique, updateMany }).replace(meetingId, newFile),
      ).rejects.toThrow('db down');
      expect(await readdir(path.join(dir, 'files'))).toEqual(['abc']);
    });

    it('если файла не было, создаёт запись как обычная загрузка', async () => {
      const findUnique = vi.fn().mockResolvedValue(null);
      const create = vi.fn().mockResolvedValue(updatedRow);

      const dto = await makeService({ findUnique, create }).replace(
        meetingId,
        newFile,
      );

      expect(create).toHaveBeenCalled();
      expect(dto.size).toBe(5);
      expect(await readdir(path.join(dir, 'files'))).toEqual(
        expect.arrayContaining(['abc', 'new']),
      );
    });

    it('если запись удалили параллельно, создаёт новую', async () => {
      const findUnique = vi
        .fn()
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(null);
      const updateMany = vi.fn().mockResolvedValue({ count: 0 });
      const create = vi.fn().mockResolvedValue(updatedRow);

      await makeService({ findUnique, updateMany, create }).replace(
        meetingId,
        newFile,
      );

      expect(create).toHaveBeenCalled();
    });

    it('параллельная замена: 409, свой новый файл удалён, чужой не тронут', async () => {
      const other = { ...row, storageKey: 'files/other' };
      await writeFile(path.join(dir, 'files', 'other'), 'чужой');
      const findUnique = vi
        .fn()
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(other);
      const updateMany = vi.fn().mockResolvedValue({ count: 0 });

      await expect(
        makeService({ findUnique, updateMany }).replace(meetingId, newFile),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((await readdir(path.join(dir, 'files'))).sort()).toEqual([
        'abc',
        'other',
      ]);
    });

    it('прерывает транскрибацию при удалении файла', async () => {
      const findUnique = vi.fn().mockResolvedValue(row);
      const del = vi.fn().mockResolvedValue(row);

      await makeService({ findUnique, delete: del }).remove(meetingId);

      expect(cancel).toHaveBeenCalledWith(row.id);
    });

    it('сбой удаления старого файла не ломает замену', async () => {
      const findUnique = vi
        .fn()
        .mockResolvedValue({ ...row, storageKey: '../outside' });
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const findUniqueOrThrow = vi.fn().mockResolvedValue(updatedRow);

      const dto = await makeService({
        findUnique,
        updateMany,
        findUniqueOrThrow,
      }).replace(meetingId, newFile);

      expect(dto.originalName).toBe('новая.mp4');
    });
  });

  describe('remove', () => {
    it('удаляет запись и файл с диска', async () => {
      const findUnique = vi.fn().mockResolvedValue(row);
      const del = vi.fn().mockResolvedValue(row);

      await makeService({ findUnique, delete: del }).remove(meetingId);

      expect(del).toHaveBeenCalledWith({ where: { id: row.id } });
      expect(await readdir(path.join(dir, 'files'))).toEqual([]);
    });

    it('404, если файла нет', async () => {
      const findUnique = vi.fn().mockResolvedValue(null);

      await expect(
        makeService({ findUnique }).remove(meetingId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('при ошибке БД файл на диске остаётся', async () => {
      const findUnique = vi.fn().mockResolvedValue(row);
      const del = vi.fn().mockRejectedValue(new Error('db down'));

      await expect(
        makeService({ findUnique, delete: del }).remove(meetingId),
      ).rejects.toThrow('db down');
      expect(await readdir(path.join(dir, 'files'))).toEqual(['abc']);
    });

    it('404, если запись удалили параллельно (P2025)', async () => {
      const findUnique = vi.fn().mockResolvedValue(row);
      const del = vi.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('gone', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(
        makeService({ findUnique, delete: del }).remove(meetingId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('openForDownload', () => {
    it('отдаёт поток и метаданные', async () => {
      const findUnique = vi.fn().mockResolvedValue(row);

      const result = await makeService({ findUnique }).openForDownload(
        meetingId,
      );
      result.stream.destroy();

      expect(result).toMatchObject({
        fileName: 'запись.mp4',
        mimeType: 'video/mp4',
        size: 3,
      });
    });

    it('404, если записи нет или файл пропал с диска', async () => {
      await expect(
        makeService({
          findUnique: vi.fn().mockResolvedValue(null),
        }).openForDownload(meetingId),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        makeService({
          findUnique: vi
            .fn()
            .mockResolvedValue({ ...row, storageKey: 'files/missing' }),
        }).openForDownload(meetingId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
