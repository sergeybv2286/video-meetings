import type { PrismaService } from '../../prisma/prisma.service.js';
import { TranscriptionQueue } from './transcription-queue.js';
import {
  TranscriptionError,
  type TranscriptionRunner,
} from './transcription-runner.js';

type Status = 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED';
interface Row {
  status: Status;
  text: string | null;
  error: string | null;
  completedAt: Date | null;
}

/** Минимальная БД в памяти: файлы и их транскрибации по id файла. */
function makeDb() {
  const rows = new Map<string, Row>();
  const history: string[] = [];
  const prisma = {
    meetingFile: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) => {
        const transcription = rows.get(where.id);
        return Promise.resolve(
          transcription
            ? { id: where.id, storageKey: `files/${where.id}`, transcription }
            : null,
        );
      }),
    },
    meetingFileTranscription: {
      upsert: vi.fn(
        ({
          where,
          update,
        }: {
          where: { meetingFileId: string };
          update: Partial<Row>;
        }) => {
          const id = where.meetingFileId;
          rows.set(id, {
            status: 'QUEUED',
            text: null,
            error: null,
            completedAt: null,
            ...(rows.has(id) ? update : {}),
          });
          history.push(`${id}:QUEUED`);
          return Promise.resolve();
        },
      ),
      findMany: vi.fn(() =>
        Promise.resolve(
          [...rows]
            .filter(([, row]) => row.status === 'QUEUED')
            .map(([meetingFileId]) => ({ meetingFileId })),
        ),
      ),
      deleteMany: vi.fn(({ where }: { where: { meetingFileId: string } }) => {
        rows.delete(where.meetingFileId);
        return Promise.resolve({ count: 1 });
      }),
      updateMany: vi.fn(
        ({
          where,
          data,
        }: {
          where: { meetingFileId?: string; status: Status };
          data: Partial<Row>;
        }) => {
          if (!where.meetingFileId) {
            // Массовое обновление по статусу (восстановление после перезапуска).
            let count = 0;
            for (const row of rows.values()) {
              if (row.status !== where.status) continue;
              Object.assign(row, data);
              count++;
            }
            return Promise.resolve({ count });
          }
          const row = rows.get(where.meetingFileId);
          if (!row || row.status !== where.status)
            return Promise.resolve({ count: 0 });
          Object.assign(row, data);
          history.push(`${where.meetingFileId}:${row.status}`);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
  };
  return {
    prisma: prisma as unknown as PrismaService,
    upsert: prisma.meetingFileTranscription.upsert,
    updateMany: prisma.meetingFileTranscription.updateMany,
    rows,
    history,
  };
}

const mp4 = (id: string) => ({ id, mimeType: 'video/mp4' });

describe('TranscriptionQueue', () => {
  it('прогоняет задачу QUEUED → PROCESSING → DONE и пишет текст и время', async () => {
    const { prisma, rows, history } = makeDb();
    const runner = { run: vi.fn().mockResolvedValue('Привет, мир') };
    const queue = new TranscriptionQueue(
      prisma,
      runner as unknown as TranscriptionRunner,
    );

    expect(await queue.enqueue(mp4('a'))).toBe('QUEUED');
    await queue.onIdle();

    expect(history).toEqual(['a:QUEUED', 'a:PROCESSING', 'a:DONE']);
    expect(rows.get('a')).toMatchObject({
      status: 'DONE',
      text: 'Привет, мир',
    });
    expect(rows.get('a')?.completedAt).toBeInstanceOf(Date);
    expect(runner.run).toHaveBeenCalledWith(
      expect.stringMatching(/files\/a$/),
      expect.any(AbortSignal),
    );
  });

  it('для MP3 тоже создаёт задачу, для PDF — нет и сбрасывает прежнюю', async () => {
    const { prisma, rows } = makeDb();
    const runner = { run: vi.fn().mockResolvedValue('текст') };
    const queue = new TranscriptionQueue(
      prisma,
      runner as unknown as TranscriptionRunner,
    );

    expect(await queue.enqueue({ id: 'a', mimeType: 'audio/mpeg' })).toBe(
      'QUEUED',
    );
    await queue.onIdle();
    expect(
      await queue.enqueue({ id: 'a', mimeType: 'application/pdf' }),
    ).toBeNull();

    expect(rows.has('a')).toBe(false);
    expect(runner.run).toHaveBeenCalledTimes(1);
  });

  it('обрабатывает файлы по одному в порядке загрузки', async () => {
    const { prisma, history } = makeDb();
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const runner = {
      run: vi.fn(async (filePath: string) => {
        active++;
        maxActive = Math.max(maxActive, active);
        order.push(filePath.split('/').pop() ?? '');
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return 'ok';
      }),
    };
    const queue = new TranscriptionQueue(
      prisma,
      runner as unknown as TranscriptionRunner,
    );

    await queue.enqueue(mp4('a'));
    await queue.enqueue(mp4('b'));
    await queue.enqueue(mp4('c'));
    await queue.onIdle();

    expect(maxActive).toBe(1);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(history.filter((h) => h.endsWith('PROCESSING'))).toEqual([
      'a:PROCESSING',
      'b:PROCESSING',
      'c:PROCESSING',
    ]);
  });

  it('ошибка Whisper даёт FAILED, и очередь идёт дальше', async () => {
    const { prisma, rows } = makeDb();
    const runner = {
      run: vi
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce('второй'),
    };
    const queue = new TranscriptionQueue(
      prisma,
      runner as unknown as TranscriptionRunner,
    );

    await queue.enqueue(mp4('a'));
    await queue.enqueue(mp4('b'));
    await queue.onIdle();

    expect(rows.get('a')).toMatchObject({
      status: 'FAILED',
      error: 'Не удалось выполнить транскрибацию',
    });
    expect(rows.get('b')).toMatchObject({ status: 'DONE', text: 'второй' });
  });

  it('повторная постановка сбрасывает прежний результат', async () => {
    const { prisma, upsert, rows } = makeDb();
    const runner = {
      run: vi
        .fn()
        .mockResolvedValueOnce('старый')
        .mockResolvedValueOnce('новый'),
    };
    const queue = new TranscriptionQueue(
      prisma,
      runner as unknown as TranscriptionRunner,
    );

    await queue.enqueue(mp4('a'));
    await queue.onIdle();
    await queue.enqueue(mp4('a'));
    expect(upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: {
          status: 'QUEUED',
          text: null,
          error: null,
          completedAt: null,
        },
      }),
    );
    await queue.onIdle();

    expect(rows.get('a')?.text).toBe('новый');
  });

  describe('надёжность', () => {
    afterEach(() => {
      delete process.env.TRANSCRIPTION_TIMEOUT_MS;
    });

    /** Runner, который висит, пока его не прервут сигналом. */
    const hangingRunner = () => ({
      run: vi.fn(
        (_path: string, signal: AbortSignal) =>
          new Promise<string>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('killed')));
          }),
      ),
    });

    it('русское сообщение TranscriptionError попадает в статус «Ошибка»', async () => {
      const { prisma, rows } = makeDb();
      const runner = {
        run: vi
          .fn()
          .mockRejectedValue(new TranscriptionError('Файл повреждён')),
      };
      const queue = new TranscriptionQueue(
        prisma,
        runner as unknown as TranscriptionRunner,
      );

      await queue.enqueue(mp4('a'));
      await queue.onIdle();

      expect(rows.get('a')).toMatchObject({
        status: 'FAILED',
        error: 'Файл повреждён',
      });
    });

    it('по таймауту процесс прерывается, статус «Ошибка» с русским сообщением', async () => {
      process.env.TRANSCRIPTION_TIMEOUT_MS = '20';
      const { prisma, rows } = makeDb();
      const runner = hangingRunner();
      const queue = new TranscriptionQueue(
        prisma,
        runner as unknown as TranscriptionRunner,
      );

      await queue.enqueue(mp4('a'));
      await queue.onIdle();

      expect(rows.get('a')?.status).toBe('FAILED');
      expect(rows.get('a')?.error).toMatch(/Превышено максимальное время/);
    });

    it('после таймаута очередь продолжает работу', async () => {
      process.env.TRANSCRIPTION_TIMEOUT_MS = '20';
      const { prisma, rows } = makeDb();
      const runner = {
        run: vi
          .fn()
          .mockImplementationOnce(hangingRunner().run)
          .mockResolvedValueOnce('второй'),
      };
      const queue = new TranscriptionQueue(
        prisma,
        runner as unknown as TranscriptionRunner,
      );

      await queue.enqueue(mp4('a'));
      await queue.enqueue(mp4('b'));
      await queue.onIdle();

      expect(rows.get('a')?.status).toBe('FAILED');
      expect(rows.get('b')).toMatchObject({ status: 'DONE', text: 'второй' });
    });

    it('cancel прерывает идущий процесс и не пишет результат', async () => {
      const { prisma, rows, history } = makeDb();
      const runner = hangingRunner();
      const queue = new TranscriptionQueue(
        prisma,
        runner as unknown as TranscriptionRunner,
      );

      await queue.enqueue(mp4('a'));
      await vi.waitFor(() => expect(runner.run).toHaveBeenCalled());
      rows.delete('a'); // запись ушла каскадом вместе с файлом
      queue.cancel('a');
      await queue.onIdle();

      expect(history).toEqual(['a:QUEUED', 'a:PROCESSING']);
      expect(rows.has('a')).toBe(false);
    });

    it('cancel убирает ожидающую задачу из очереди', async () => {
      const { prisma, rows } = makeDb();
      const runner = hangingRunner();
      runner.run.mockImplementationOnce(() => Promise.resolve('первый'));
      const queue = new TranscriptionQueue(
        prisma,
        runner as unknown as TranscriptionRunner,
      );

      await queue.enqueue(mp4('a'));
      await queue.enqueue(mp4('b'));
      queue.cancel('b');
      await queue.onIdle();

      expect(runner.run).toHaveBeenCalledTimes(1);
      expect(rows.get('b')?.status).toBe('QUEUED');
    });

    it('замена файла: результат старой задачи игнорируется, новая выполняется', async () => {
      const { prisma, rows } = makeDb();
      const runner = {
        run: vi
          .fn()
          // Старая задача ничего не знает об отмене и «завершается» с чужим текстом.
          .mockImplementationOnce(
            () =>
              new Promise((resolve) => setTimeout(() => resolve('старый'), 30)),
          )
          .mockResolvedValueOnce('новый'),
      };
      const queue = new TranscriptionQueue(
        prisma,
        runner as unknown as TranscriptionRunner,
      );

      await queue.enqueue(mp4('a'));
      await vi.waitFor(() => expect(runner.run).toHaveBeenCalledTimes(1));
      await queue.enqueue(mp4('a')); // замена: отмена старой + новая задача
      await queue.onIdle();

      expect(rows.get('a')).toMatchObject({ status: 'DONE', text: 'новый' });
    });

    it('recover возвращает «В процессе» в очередь и запускает задачи по порядку', async () => {
      const { prisma, rows } = makeDb();
      rows.set('a', {
        status: 'PROCESSING',
        text: null,
        error: null,
        completedAt: null,
      });
      rows.set('b', {
        status: 'QUEUED',
        text: null,
        error: null,
        completedAt: null,
      });
      rows.set('c', {
        status: 'DONE',
        text: 'готово',
        error: null,
        completedAt: new Date(),
      });
      const runner = { run: vi.fn().mockResolvedValue('текст') };
      const queue = new TranscriptionQueue(
        prisma,
        runner as unknown as TranscriptionRunner,
      );

      expect(await queue.recover()).toBe(2);
      await queue.onIdle();

      expect(runner.run).toHaveBeenCalledTimes(2);
      expect(rows.get('a')?.status).toBe('DONE');
      expect(rows.get('b')?.status).toBe('DONE');
      expect(rows.get('c')?.text).toBe('готово');
    });

    it('retry возвращает упавшую задачу в очередь и выполняет её', async () => {
      const { prisma, rows } = makeDb();
      rows.set('a', {
        status: 'FAILED',
        text: null,
        error: 'x',
        completedAt: null,
      });
      const runner = { run: vi.fn().mockResolvedValue('со второй попытки') };
      const queue = new TranscriptionQueue(
        prisma,
        runner as unknown as TranscriptionRunner,
      );

      expect(await queue.retry('a')).toBe(true);
      await queue.onIdle();

      expect(rows.get('a')).toMatchObject({
        status: 'DONE',
        text: 'со второй попытки',
        error: null,
      });
    });

    it.each(['QUEUED', 'PROCESSING', 'DONE'] as const)(
      'retry не трогает задачу в статусе %s',
      async (status) => {
        const { prisma, rows } = makeDb();
        rows.set('a', { status, text: null, error: null, completedAt: null });
        const runner = { run: vi.fn() };
        const queue = new TranscriptionQueue(
          prisma,
          runner as unknown as TranscriptionRunner,
        );

        expect(await queue.retry('a')).toBe(false);
        await queue.onIdle();

        expect(runner.run).not.toHaveBeenCalled();
        expect(rows.get('a')?.status).toBe(status);
      },
    );

    it('короткий сбой БД при записи результата не оставляет задачу «В процессе»', async () => {
      const { prisma, rows, updateMany: update } = makeDb();
      const original = update.getMockImplementation()!;
      // Первые два вызова — claim и сам результат: падает запись результата.
      update
        .mockImplementationOnce(original)
        .mockRejectedValueOnce(new Error('db blip'))
        .mockRejectedValueOnce(new Error('db blip'));
      const runner = { run: vi.fn().mockResolvedValue('текст') };
      const queue = new TranscriptionQueue(
        prisma,
        runner as unknown as TranscriptionRunner,
      );

      await queue.enqueue(mp4('a'));
      await queue.onIdle();

      expect(rows.get('a')).toMatchObject({ status: 'DONE', text: 'текст' });
    });

    it('постановка сразу после опустошения очереди запускается', async () => {
      const { prisma, rows } = makeDb();
      const runner = { run: vi.fn().mockResolvedValue('текст') };
      const queue = new TranscriptionQueue(
        prisma,
        runner as unknown as TranscriptionRunner,
      );

      await queue.enqueue(mp4('a'));
      // Ждём завершения первой задачи и сразу ставим вторую, не вызывая onIdle.
      await vi.waitFor(() => expect(rows.get('a')?.status).toBe('DONE'));
      await queue.enqueue(mp4('b'));
      await queue.onIdle();

      expect(rows.get('b')?.status).toBe('DONE');
    });
  });
});
