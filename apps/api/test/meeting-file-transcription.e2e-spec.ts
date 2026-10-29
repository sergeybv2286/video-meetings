import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { MeetingsService } from './../src/meetings/meetings.service.js';
import { TranscriptionQueue } from './../src/meeting-files/transcription/transcription-queue.js';
import {
  TranscriptionError,
  TranscriptionRunner,
} from './../src/meeting-files/transcription/transcription-runner.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { setupApp } from './../src/setup-app.js';
import { FakeTranscriptionRunner } from './fake-transcription-runner.js';
import { samples } from './sample-files.js';
import { TEST_STORAGE_DIR } from './test-storage.js';

describe('Транскрибация файла встречи (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let queue: TranscriptionQueue;
  let runner: FakeTranscriptionRunner;
  let auth: { Authorization: string };

  const createMeeting = async () => {
    const { body } = await request(app.getHttpServer())
      .post('/meetings')
      .set(auth)
      .send({ title: 'Планёрка' })
      .expect(201);
    return body.id as string;
  };

  const upload = (id: string, content: Buffer, name: string) =>
    request(app.getHttpServer())
      .post(`/meetings/${id}/file`)
      .set(auth)
      .attach('file', content, name);

  const fileInfo = async (id: string) =>
    (await request(app.getHttpServer()).get(`/meetings/${id}/file`).set(auth))
      .body;

  beforeEach(async () => {
    await rm(TEST_STORAGE_DIR, { recursive: true, force: true });
    await mkdir(TEST_STORAGE_DIR, { recursive: true });
    runner = new FakeTranscriptionRunner();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TranscriptionRunner)
      .useValue(runner)
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    queue = app.get(TranscriptionQueue);
    await prisma.user.deleteMany();
    await prisma.meetingFile.deleteMany();
    const { body } = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'a@example.com', password: 'secret123' })
      .expect(201);
    auth = { Authorization: `Bearer ${body.accessToken}` };
  });

  afterEach(async () => {
    await queue.onIdle();
    await app.close();
  });

  it.each([
    ['MP4', samples.mp4(), 'Запись.mp4'],
    ['MP3', samples.mp3(), 'Запись.mp3'],
  ])(
    '%s: «В очереди» после загрузки, затем «Готово» с текстом в БД',
    async (_, content, name) => {
      const meetingId = await createMeeting();

      const { body } = await upload(meetingId, content, name).expect(201);
      expect(body.transcriptionStatus).toBe('QUEUED');
      expect(body.status).toBe('UPLOADED');

      await queue.onIdle();

      expect((await fileInfo(meetingId)).transcriptionStatus).toBe('DONE');
      const row = await prisma.meetingFileTranscription.findFirstOrThrow();
      expect(row).toMatchObject({ status: 'DONE', text: runner.text });
      expect(row.completedAt).toBeInstanceOf(Date);
    },
  );

  it('PDF не транскрибируется: статуса нет, запись не создаётся', async () => {
    const meetingId = await createMeeting();

    const { body } = await upload(
      meetingId,
      samples.pdf(),
      'Повестка.pdf',
    ).expect(201);

    expect(body.transcriptionStatus).toBeNull();
    expect((await fileInfo(meetingId)).transcriptionStatus).toBeNull();
    expect(await prisma.meetingFileTranscription.count()).toBe(0);
    expect(runner.calls).toEqual([]);
  });

  it('одновременно в работе не больше одного файла', async () => {
    const first = await createMeeting();
    const second = await createMeeting();
    const third = await createMeeting();

    await upload(first, samples.mp4(), 'a.mp4').expect(201);
    await upload(second, samples.mp3(), 'b.mp3').expect(201);
    await upload(third, samples.mp4(), 'c.mp4').expect(201);
    await queue.onIdle();

    expect(runner.calls).toHaveLength(3);
    expect(runner.maxActive).toBe(1);
    for (const id of [first, second, third]) {
      expect((await fileInfo(id)).transcriptionStatus).toBe('DONE');
    }
  });

  it('сбой Whisper даёт «Ошибка», API продолжает работать', async () => {
    runner.error = new Error('whisper упал');
    const meetingId = await createMeeting();

    await upload(meetingId, samples.mp4(), 'a.mp4').expect(201);
    await queue.onIdle();

    expect((await fileInfo(meetingId)).transcriptionStatus).toBe('FAILED');
    await request(app.getHttpServer()).get('/meetings').set(auth).expect(200);
  });

  describe('надёжность', () => {
    afterEach(() => {
      delete process.env.TRANSCRIPTION_TIMEOUT_MS;
    });

    const replace = (id: string, content: Buffer, name: string) =>
      request(app.getHttpServer())
        .put(`/meetings/${id}/file`)
        .set(auth)
        .attach('file', content, name);

    const waitForRun = (calls: number) =>
      vi.waitFor(() => expect(runner.calls).toHaveLength(calls));

    it('повреждённый файл: «Ошибка» с русским сообщением, API работает', async () => {
      runner.error = new TranscriptionError(
        'Не удалось прочитать звук: файл повреждён',
      );
      const meetingId = await createMeeting();

      await upload(meetingId, samples.mp4(), 'a.mp4').expect(201);
      await queue.onIdle();

      expect((await fileInfo(meetingId)).transcriptionStatus).toBe('FAILED');
      expect(
        (await prisma.meetingFileTranscription.findFirstOrThrow()).error,
      ).toBe('Не удалось прочитать звук: файл повреждён');
      await request(app.getHttpServer()).get('/meetings').set(auth).expect(200);
    });

    it('таймаут убивает процесс и даёт «Ошибка»', async () => {
      process.env.TRANSCRIPTION_TIMEOUT_MS = '50';
      runner.delayMs = 5000;
      const meetingId = await createMeeting();

      await upload(meetingId, samples.mp4(), 'a.mp4').expect(201);
      await queue.onIdle();

      expect(runner.aborted).toBe(1);
      expect((await fileInfo(meetingId)).transcriptionStatus).toBe('FAILED');
      expect(
        (await prisma.meetingFileTranscription.findFirstOrThrow()).error,
      ).toMatch(/Превышено максимальное время/);
    });

    it('удаление файла прерывает процесс и удаляет запись транскрибации', async () => {
      runner.delayMs = 5000;
      const meetingId = await createMeeting();
      await upload(meetingId, samples.mp4(), 'a.mp4').expect(201);
      await waitForRun(1);

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/file`)
        .set(auth)
        .expect(204);
      await queue.onIdle();

      expect(runner.aborted).toBe(1);
      expect(await prisma.meetingFileTranscription.count()).toBe(0);
    });

    it('замена на MP3: старый результат не попадает в новый файл', async () => {
      runner.delayMs = 5000;
      const meetingId = await createMeeting();
      await upload(meetingId, samples.mp4(), 'a.mp4').expect(201);
      await waitForRun(1);

      runner.delayMs = 10;
      runner.text = 'Текст нового файла';
      const { body } = await replace(meetingId, samples.mp3(), 'b.mp3').expect(
        200,
      );
      expect(body.transcriptionStatus).toBe('QUEUED');
      await queue.onIdle();

      expect(runner.aborted).toBe(1);
      expect(runner.calls).toHaveLength(2);
      expect(await prisma.meetingFileTranscription.findMany()).toMatchObject([
        { status: 'DONE', text: 'Текст нового файла' },
      ]);
    });

    it('замена готового MP4 на PDF сбрасывает результат и статус', async () => {
      const meetingId = await createMeeting();
      await upload(meetingId, samples.mp4(), 'a.mp4').expect(201);
      await queue.onIdle();
      expect((await fileInfo(meetingId)).transcriptionStatus).toBe('DONE');

      const { body } = await replace(meetingId, samples.pdf(), 'b.pdf').expect(
        200,
      );

      expect(body.transcriptionStatus).toBeNull();
      expect((await fileInfo(meetingId)).transcriptionStatus).toBeNull();
      expect(await prisma.meetingFileTranscription.count()).toBe(0);
    });

    it('замена PDF на MP4 запускает транскрибацию', async () => {
      const meetingId = await createMeeting();
      await upload(meetingId, samples.pdf(), 'a.pdf').expect(201);

      const { body } = await replace(meetingId, samples.mp4(), 'b.mp4').expect(
        200,
      );
      await queue.onIdle();

      expect(body.transcriptionStatus).toBe('QUEUED');
      expect((await fileInfo(meetingId)).transcriptionStatus).toBe('DONE');
    });

    it('после перезапуска незавершённые задачи выполняются по порядку, задачи без встречи — нет', async () => {
      const alive: string[] = [randomUUID(), randomUUID(), randomUUID()];
      const orphan = randomUUID();
      const base = Date.now();
      const specs = [
        { meetingId: alive[0], status: 'PROCESSING' as const, offset: 0 },
        { meetingId: orphan, status: 'QUEUED' as const, offset: 1 },
        { meetingId: alive[1], status: 'QUEUED' as const, offset: 2 },
        { meetingId: alive[2], status: 'DONE' as const, offset: 3 },
      ];
      for (const { meetingId, status, offset } of specs) {
        await prisma.meetingFile.create({
          data: {
            meetingId,
            originalName: `${meetingId}.mp4`,
            mimeType: 'video/mp4',
            size: 1,
            storageKey: `files/${randomUUID()}`,
            uploadedAt: new Date(base + offset * 1000),
            transcription: {
              create: {
                status,
                text: status === 'DONE' ? 'Готовый текст' : null,
              },
            },
          },
        });
      }
      const restartedRunner = new FakeTranscriptionRunner();
      const restarted = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(TranscriptionRunner)
        .useValue(restartedRunner)
        .overrideProvider(MeetingsService)
        .useValue({ exists: (id: string) => alive.includes(id) })
        .compile();
      const restartedApp = restarted.createNestApplication();
      try {
        await restartedApp.init();
        await restartedApp.get(TranscriptionQueue).onIdle();
      } finally {
        await restartedApp.close();
      }

      const rows = await prisma.meetingFileTranscription.findMany({
        include: { meetingFile: true },
      });
      expect(restartedRunner.calls).toHaveLength(2);
      expect(rows).toHaveLength(3);
      const byMeeting = new Map(rows.map((r) => [r.meetingFile.meetingId, r]));
      expect(byMeeting.get(alive[0])?.status).toBe('DONE');
      expect(byMeeting.get(alive[1])?.status).toBe('DONE');
      expect(byMeeting.get(alive[2])).toMatchObject({
        status: 'DONE',
        text: 'Готовый текст',
      });
      expect(byMeeting.has(orphan)).toBe(false);
    });
  });

  describe('API текста, скачивания и повтора', () => {
    const base = (id: string) => `/meetings/${id}/file/transcription`;
    const get = (path: string, headers: { Authorization?: string } = auth) =>
      request(app.getHttpServer()).get(path).set(headers);

    const register = async (email: string) => {
      const { body } = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'secret123' })
        .expect(201);
      return { Authorization: `Bearer ${body.accessToken}` };
    };

    const uploadDone = async (name = 'Итоги встречи.mp4') => {
      const meetingId = await createMeeting();
      await upload(meetingId, samples.mp4(), name).expect(201);
      await queue.onIdle();
      return meetingId;
    };

    it('GET отдаёт статус и текст владельцу', async () => {
      const meetingId = await uploadDone();

      const { body } = await get(base(meetingId)).expect(200);

      expect(body).toMatchObject({
        status: 'DONE',
        text: runner.text,
        error: null,
      });
      expect(body.completedAt).toBeTypeOf('string');
    });

    it('GET: 404 для файла без транскрибации и для встречи без файла', async () => {
      const withPdf = await createMeeting();
      await upload(withPdf, samples.pdf(), 'a.pdf').expect(201);
      const withoutFile = await createMeeting();

      await get(base(withPdf)).expect(404);
      await get(base(withoutFile)).expect(404);
    });

    it('401 без токена, 404 для чужой и несуществующей встречи', async () => {
      const meetingId = await uploadDone();
      const other = await register('b@example.com');

      for (const path of [base(meetingId), `${base(meetingId)}/download`]) {
        await get(path, {}).expect(401);
        await get(path, other).expect(404);
      }
      await request(app.getHttpServer())
        .post(`${base(meetingId)}/retry`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`${base(meetingId)}/retry`)
        .set(other)
        .expect(404);
      await get(base('00000000-0000-0000-0000-000000000000')).expect(404);
    });

    it('скачивание: UTF-8, attachment, имя на основе исходного файла', async () => {
      const meetingId = await uploadDone();

      const res = await get(`${base(meetingId)}/download`)
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain(
        `filename*=UTF-8''${encodeURIComponent('Итоги встречи.txt')}`,
      );
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect((res.body as Buffer).toString('utf8')).toBe(runner.text);
    });

    it('скачивание: 409, пока текста нет', async () => {
      runner.error = new Error('упал');
      const meetingId = await uploadDone();

      await get(`${base(meetingId)}/download`).expect(409);
    });

    it('retry: «Ошибка» → снова в очередь и «Готово»', async () => {
      runner.error = new Error('упал');
      const meetingId = await uploadDone();
      expect((await get(base(meetingId)).expect(200)).body.status).toBe(
        'FAILED',
      );
      runner.error = null;

      const { body } = await request(app.getHttpServer())
        .post(`${base(meetingId)}/retry`)
        .set(auth)
        .expect(200);
      // Очередь может успеть взять задачу до чтения статуса.
      expect(['QUEUED', 'PROCESSING']).toContain(body.status);
      await queue.onIdle();

      expect((await get(base(meetingId)).expect(200)).body).toMatchObject({
        status: 'DONE',
        text: runner.text,
        error: null,
      });
    });

    it('retry: 409 вне статуса «Ошибка»', async () => {
      const meetingId = await uploadDone();

      await request(app.getHttpServer())
        .post(`${base(meetingId)}/retry`)
        .set(auth)
        .expect(409);
    });

    it('retry ограничен по частоте: после лимита 429', async () => {
      const meetingId = await uploadDone();
      const retry = () =>
        request(app.getHttpServer())
          .post(`${base(meetingId)}/retry`)
          .set(auth);

      for (let i = 0; i < 5; i++) await retry().expect(409);
      await retry().expect(429);
    });
  });
});
