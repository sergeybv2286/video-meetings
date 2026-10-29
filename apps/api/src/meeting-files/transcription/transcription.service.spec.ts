import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { TranscriptionService } from './transcription.service.js';
import type { TranscriptionQueue } from './transcription-queue.js';

const meetingId = '11111111-1111-1111-1111-111111111111';
const transcription = (patch: Record<string, unknown> = {}) => ({
  id: 't1',
  meetingFileId: 'f1',
  status: 'DONE',
  text: 'Привет',
  error: null,
  completedAt: new Date('2026-10-29T10:00:00.000Z'),
  ...patch,
});

function makeService(file: unknown, retry = vi.fn().mockResolvedValue(true)) {
  const prisma = {
    meetingFile: { findUnique: vi.fn().mockResolvedValue(file) },
  };
  return {
    retry,
    service: new TranscriptionService(
      prisma as unknown as PrismaService,
      { retry } as unknown as TranscriptionQueue,
    ),
  };
}

const withFile = (
  patch: Record<string, unknown> = {},
  name = 'Запись.mp4',
) => ({
  id: 'f1',
  originalName: name,
  transcription: transcription(patch),
});

describe('TranscriptionService', () => {
  it('find отдаёт статус, текст и время завершения', async () => {
    const { service } = makeService(withFile());

    expect(await service.find(meetingId)).toEqual({
      status: 'DONE',
      text: 'Привет',
      error: null,
      completedAt: '2026-10-29T10:00:00.000Z',
    });
  });

  it('find: 404, если файла нет', async () => {
    const { service } = makeService(null);

    await expect(service.find(meetingId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('find: 404, если файл не подлежит транскрибации', async () => {
    const { service } = makeService({
      id: 'f1',
      originalName: 'a.pdf',
      transcription: null,
    });

    await expect(service.find(meetingId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getDownload: имя .txt строится из имени исходного файла', async () => {
    const { service } = makeService(withFile({}, 'Планёрка.итоги.mp3'));

    expect(await service.getDownload(meetingId)).toEqual({
      text: 'Привет',
      fileName: 'Планёрка.итоги.txt',
    });
  });

  it('getDownload: имя без расширения', async () => {
    const { service } = makeService(withFile({}, 'запись'));

    expect((await service.getDownload(meetingId)).fileName).toBe('запись.txt');
  });

  it.each(['QUEUED', 'PROCESSING', 'FAILED'])(
    'getDownload: 409 для статуса %s',
    async (status) => {
      const { service } = makeService(withFile({ status, text: null }));

      await expect(service.getDownload(meetingId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    },
  );

  it('retry ставит задачу заново и возвращает новый статус', async () => {
    const { service, retry } = makeService(withFile({ status: 'FAILED' }));

    await service.retry(meetingId);

    expect(retry).toHaveBeenCalledWith('f1');
  });

  it('retry: 409, если очередь не приняла повтор', async () => {
    const { service } = makeService(
      withFile({ status: 'DONE' }),
      vi.fn().mockResolvedValue(false),
    );

    await expect(service.retry(meetingId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
