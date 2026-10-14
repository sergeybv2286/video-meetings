import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { setupApp } from './../src/setup-app.js';
import { mp4M4vBrand, samples } from './sample-files.js';
import { TEST_STORAGE_DIR } from './test-storage.js';

describe('Meeting files (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auth: { Authorization: string };
  let otherAuth: { Authorization: string };
  let meetingId: string;

  const content = samples.mp4();
  const missingId = '00000000-0000-0000-0000-000000000000';

  const register = async (email: string) => {
    const { body } = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'secret123' })
      .expect(201);
    return { Authorization: `Bearer ${body.accessToken}` };
  };

  const upload = (id: string, headers: { Authorization?: string } = auth) =>
    request(app.getHttpServer())
      .post(`/meetings/${id}/file`)
      .set(headers)
      .attach('file', content, 'Запись встречи.mp4');

  beforeEach(async () => {
    await rm(TEST_STORAGE_DIR, { recursive: true, force: true });
    await mkdir(TEST_STORAGE_DIR, { recursive: true });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany();
    await prisma.meetingFile.deleteMany();
    auth = await register('a@example.com');
    otherAuth = await register('b@example.com');
    const { body } = await request(app.getHttpServer())
      .post('/meetings')
      .set(auth)
      .send({ title: 'Планёрка' })
      .expect(201);
    meetingId = body.id;
  });

  afterEach(async () => {
    delete process.env.MEETING_FILE_MAX_SIZE;
    await app.close();
  });

  /** На диске и в БД нет следов загрузки. */
  const expectNoLeftovers = async () => {
    expect(await prisma.meetingFile.count()).toBe(0);
    for (const dir of ['tmp', 'files']) {
      const entries = await readdir(path.join(TEST_STORAGE_DIR, dir)).catch(
        () => [],
      );
      expect(entries).toEqual([]);
    }
  };

  describe('POST /meetings/:id/file', () => {
    it('загружает файл и возвращает метаданные со статусом UPLOADED', async () => {
      const { body } = await upload(meetingId).expect(201);

      expect(body).toMatchObject({
        meetingId,
        originalName: 'Запись встречи.mp4',
        size: content.length,
        status: 'UPLOADED',
      });
      expect(body.id).toBeTypeOf('string');
      expect(body.uploadedAt).toBeTypeOf('string');
      expect(body).not.toHaveProperty('storageKey');
    });

    it('сохраняет файл на диск под серверным именем и пишет метаданные в БД', async () => {
      await upload(meetingId).expect(201);

      const record = await prisma.meetingFile.findUniqueOrThrow({
        where: { meetingId },
      });
      expect(record.storageKey).toMatch(/^files\/[0-9a-f-]{36}$/);
      expect(
        await readFile(path.join(TEST_STORAGE_DIR, record.storageKey)),
      ).toEqual(content);
      expect(await readdir(path.join(TEST_STORAGE_DIR, 'tmp'))).toEqual([]);
    });

    it('принимает .mp4 с брендом M4V', async () => {
      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/file`)
        .set(auth)
        .attach('file', mp4M4vBrand(), 'экспорт.mp4')
        .expect(201);
    });

    it('400, если файл не передан', async () => {
      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/file`)
        .set(auth)
        .expect(400);
    });

    it('409 при повторной загрузке, на диске остаётся только первый файл', async () => {
      await upload(meetingId).expect(201);
      await upload(meetingId).expect(409);

      expect(await readdir(path.join(TEST_STORAGE_DIR, 'files'))).toHaveLength(
        1,
      );
    });

    it('404 для чужой встречи, файл на диск не пишется', async () => {
      await upload(meetingId, otherAuth).expect(404);

      expect(await prisma.meetingFile.count()).toBe(0);
      await expect(
        readdir(path.join(TEST_STORAGE_DIR, 'files')),
      ).rejects.toThrow();
    });

    it('404 для несуществующей встречи', async () => {
      await upload(missingId).expect(404);
    });

    it('401 без токена', async () => {
      await upload(meetingId, {}).expect(401);
    });
  });

  describe('валидация загрузки', () => {
    const attach = (data: Buffer, name: string, headers = auth) =>
      request(app.getHttpServer())
        .post(`/meetings/${meetingId}/file`)
        .set(headers)
        .attach('file', data, name);

    it.each([
      ['mp4', 'video/mp4'],
      ['mov', 'video/quicktime'],
      ['webm', 'video/webm'],
      ['mp3', 'audio/mpeg'],
      ['m4a', 'audio/x-m4a'],
      ['wav', 'audio/wav'],
      ['pdf', 'application/pdf'],
      [
        'docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      [
        'pptx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ],
      ['txt', 'text/plain'],
      ['vtt', 'text/vtt'],
      ['srt', 'application/x-subrip'],
    ] as const)(
      'принимает .%s и сохраняет MIME, определённый сервером',
      async (ext, mime) => {
        const { body } = await attach(samples[ext](), `Файл.${ext}`).expect(
          201,
        );
        expect(body.mimeType).toBe(mime);
      },
    );

    it('MIME от клиента не доверяется', async () => {
      const { body } = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/file`)
        .set(auth)
        .attach('file', samples.txt(), {
          filename: 'заметки.txt',
          contentType: 'application/x-msdownload',
        })
        .expect(201);
      expect(body.mimeType).toBe('text/plain');
    });

    it('415 для недопустимого типа, остатков нет', async () => {
      const { body } = await attach(samples.exe(), 'setup.exe').expect(415);
      expect(body.message).toMatch(/Недопустимый тип файла/);
      await expectNoLeftovers();
    });

    it('415 для переименованного расширения (exe → mp4), остатков нет', async () => {
      const { body } = await attach(samples.exe(), 'запись.mp4').expect(415);
      expect(body.message).toBe(
        'Содержимое файла не соответствует его расширению',
      );
      await expectNoLeftovers();
    });

    it('415 для docx, подложенного под pdf, и для текста с бинарным содержимым', async () => {
      await attach(samples.docx(), 'a.pdf').expect(415);
      await attach(samples.mp4(), 'a.txt').expect(415);
      await expectNoLeftovers();
    });

    it('415 для zip без word/document.xml под видом docx', async () => {
      await attach(samples.pptx(), 'a.docx').expect(415);
      await expectNoLeftovers();
    });

    it('400 для пустого файла, остатков нет', async () => {
      const { body } = await attach(Buffer.alloc(0), 'пусто.txt').expect(400);
      expect(body.message).toBe('Файл пустой');
      await expectNoLeftovers();
    });

    it('413 для файла больше лимита (в потоке), остатков нет', async () => {
      process.env.MEETING_FILE_MAX_SIZE = '1000';
      const big = Buffer.concat([samples.mp4(), Buffer.alloc(5000)]);
      const { body } = await attach(big, 'большой.mp4').expect(413);
      expect(body.message).toMatch(/Файл слишком большой/);
      await expectNoLeftovers();
    });

    it('413 по Content-Length до чтения тела', async () => {
      process.env.MEETING_FILE_MAX_SIZE = '1000';
      const { body } = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/file`)
        .set(auth)
        .set('Content-Type', 'multipart/form-data; boundary=x')
        .set('Content-Length', String(10 * 1024 * 1024))
        .expect(413);
      expect(body.message).toMatch(/Файл слишком большой/);
      await expectNoLeftovers();
    });

    it('вредоносное имя не влияет на путь на диске', async () => {
      const { body } = await attach(
        samples.mp4(),
        '../../../etc/cron.d/evil.mp4',
      ).expect(201);
      expect(body.originalName).toBe('evil.mp4');
      const record = await prisma.meetingFile.findUniqueOrThrow({
        where: { meetingId },
      });
      expect(record.storageKey).toMatch(/^files\/[0-9a-f-]{36}$/);
      expect(await readdir(path.join(TEST_STORAGE_DIR, 'files'))).toEqual([
        record.storageKey.replace('files/', ''),
      ]);
    });

    it('прерванная загрузка не оставляет файла на диске и записи в БД', async () => {
      await app.listen(0, '127.0.0.1');
      const { port } = (
        app.getHttpServer() as unknown as net.Server
      ).address() as net.AddressInfo;
      const boundary = 'abort-boundary';
      const head =
        `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="file"; filename="a.mp4"\r\n' +
        'Content-Type: video/mp4\r\n\r\n';
      const partial = Buffer.concat([
        Buffer.from(head),
        samples.mp4(),
        Buffer.alloc(8192),
      ]);
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1', () => {
          socket.write(
            'POST /meetings/' +
              meetingId +
              '/file HTTP/1.1\r\nHost: localhost\r\n' +
              `${Object.entries(auth)
                .map(([k, v]) => `${k}: ${v}`)
                .join('')}\r\n` +
              `Content-Type: multipart/form-data; boundary=${boundary}\r\n` +
              `Content-Length: ${partial.length + 1_000_000}\r\n\r\n`,
          );
          socket.write(partial, () => setTimeout(() => socket.destroy(), 100));
        });
        socket.on('close', () => resolve());
        socket.on('error', reject);
      });
      await new Promise((r) => setTimeout(r, 500));
      await expectNoLeftovers();
    });
  });

  describe('GET /meetings/:id/file', () => {
    it('возвращает метаданные загруженного файла', async () => {
      const uploaded = await upload(meetingId).expect(201);
      const { body } = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/file`)
        .set(auth)
        .expect(200);

      expect(body).toEqual(uploaded.body);
      expect(body.status).toBe('UPLOADED');
    });

    it('404, если у встречи нет файла', async () => {
      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/file`)
        .set(auth)
        .expect(404);
    });

    it('404 для чужой встречи, даже если файл есть', async () => {
      await upload(meetingId).expect(201);
      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/file`)
        .set(otherAuth)
        .expect(404);
    });

    it('404 для несуществующей встречи', async () => {
      await request(app.getHttpServer())
        .get(`/meetings/${missingId}/file`)
        .set(auth)
        .expect(404);
    });

    it('401 без токена', async () => {
      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/file`)
        .expect(401);
    });
  });

  const sha256 = (data: Buffer) =>
    createHash('sha256').update(data).digest('hex');

  const filesOnDisk = () => readdir(path.join(TEST_STORAGE_DIR, 'files'));

  describe('GET /meetings/:id/file/download', () => {
    const download = (id: string, headers: { Authorization?: string } = auth) =>
      request(app.getHttpServer())
        .get(`/meetings/${id}/file/download`)
        .set(headers)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });

    it('отдаёт тот же файл (контрольная сумма совпадает) с исходным именем и заголовками', async () => {
      await upload(meetingId).expect(201);

      const res = await download(meetingId).expect(200);

      expect(sha256(res.body as Buffer)).toBe(sha256(content));
      expect(res.headers['content-type']).toContain('video/mp4');
      expect(res.headers['content-length']).toBe(String(content.length));
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain(
        `filename*=UTF-8''${encodeURIComponent('Запись встречи.mp4')}`,
      );
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('404, если файла нет', async () => {
      await download(meetingId).expect(404);
    });

    it('404, если файл пропал с диска', async () => {
      await upload(meetingId).expect(201);
      for (const name of await filesOnDisk()) {
        await rm(path.join(TEST_STORAGE_DIR, 'files', name));
      }

      await download(meetingId).expect(404);
    });

    it('404 для чужой встречи', async () => {
      await upload(meetingId).expect(201);
      await download(meetingId, otherAuth).expect(404);
    });

    it('404 для несуществующей встречи', async () => {
      await download(missingId).expect(404);
    });

    it('401 без токена', async () => {
      await download(meetingId, {}).expect(401);
    });
  });

  describe('PUT /meetings/:id/file', () => {
    const newContent = samples.pdf();
    const replace = (
      id: string,
      headers: { Authorization?: string } = auth,
      data: Buffer = newContent,
      name = 'Итоги.pdf',
    ) =>
      request(app.getHttpServer())
        .put(`/meetings/${id}/file`)
        .set(headers)
        .attach('file', data, name);

    it('заменяет файл: новые метаданные, на диске только новый файл', async () => {
      const first = await upload(meetingId).expect(201);

      const { body } = await replace(meetingId).expect(200);

      expect(body).toMatchObject({
        id: first.body.id,
        meetingId,
        originalName: 'Итоги.pdf',
        mimeType: 'application/pdf',
        size: newContent.length,
        status: 'UPLOADED',
      });
      expect(await prisma.meetingFile.count()).toBe(1);
      const record = await prisma.meetingFile.findUniqueOrThrow({
        where: { meetingId },
      });
      expect(await filesOnDisk()).toEqual([record.storageKey.split('/')[1]]);
      expect(
        await readFile(path.join(TEST_STORAGE_DIR, record.storageKey)),
      ).toEqual(newContent);
      const info = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/file`)
        .set(auth)
        .expect(200);
      expect(info.body.originalName).toBe('Итоги.pdf');
    });

    it('параллельные замены: в конце на диске ровно один файл, совпадающий с записью', async () => {
      await upload(meetingId).expect(201);

      const results = await Promise.all(
        [1, 2, 3, 4].map((n) =>
          replace(meetingId, auth, samples.pdf(), `Версия ${n}.pdf`),
        ),
      );

      expect(results.every((r) => [200, 409].includes(r.status))).toBe(true);
      expect(results.some((r) => r.status === 200)).toBe(true);
      const record = await prisma.meetingFile.findUniqueOrThrow({
        where: { meetingId },
      });
      expect(await filesOnDisk()).toEqual([record.storageKey.split('/')[1]]);
    });

    it('если файла ещё нет, загружает его', async () => {
      await replace(meetingId).expect(200);

      expect(await prisma.meetingFile.count()).toBe(1);
      expect(await filesOnDisk()).toHaveLength(1);
    });

    it('невалидный новый файл: 415, старый файл и метаданные не тронуты', async () => {
      await upload(meetingId).expect(201);
      const before = await prisma.meetingFile.findUniqueOrThrow({
        where: { meetingId },
      });

      await replace(meetingId, auth, samples.exe(), 'Итоги.pdf').expect(415);

      const after = await prisma.meetingFile.findUniqueOrThrow({
        where: { meetingId },
      });
      expect(after).toEqual(before);
      expect(await filesOnDisk()).toEqual([before.storageKey.split('/')[1]]);
      expect(await readdir(path.join(TEST_STORAGE_DIR, 'tmp'))).toEqual([]);
    });

    it('слишком большой новый файл: 413, старый файл не тронут', async () => {
      await upload(meetingId).expect(201);
      process.env.MEETING_FILE_MAX_SIZE = '100';

      await replace(
        meetingId,
        auth,
        Buffer.concat([newContent, Buffer.alloc(500)]),
      ).expect(413);

      const record = await prisma.meetingFile.findUniqueOrThrow({
        where: { meetingId },
      });
      expect(record.originalName).toBe('Запись встречи.mp4');
      expect(await filesOnDisk()).toEqual([record.storageKey.split('/')[1]]);
    });

    it('400, если файл не передан', async () => {
      await upload(meetingId).expect(201);
      await request(app.getHttpServer())
        .put(`/meetings/${meetingId}/file`)
        .set(auth)
        .expect(400);
    });

    it('404 для чужой встречи, файл не меняется', async () => {
      await upload(meetingId).expect(201);

      await replace(meetingId, otherAuth).expect(404);

      const record = await prisma.meetingFile.findUniqueOrThrow({
        where: { meetingId },
      });
      expect(record.originalName).toBe('Запись встречи.mp4');
      expect(await filesOnDisk()).toHaveLength(1);
    });

    it('404 для несуществующей встречи', async () => {
      await replace(missingId).expect(404);
    });

    it('401 без токена', async () => {
      await replace(meetingId, {}).expect(401);
    });
  });

  describe('DELETE /meetings/:id/file', () => {
    const remove = (id: string, headers: { Authorization?: string } = auth) =>
      request(app.getHttpServer()).delete(`/meetings/${id}/file`).set(headers);

    it('удаляет файл с диска и из метаданных', async () => {
      await upload(meetingId).expect(201);

      await remove(meetingId).expect(204);

      await expectNoLeftovers();
      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/file`)
        .set(auth)
        .expect(404);
    });

    it('после удаления можно загрузить файл заново', async () => {
      await upload(meetingId).expect(201);
      await remove(meetingId).expect(204);

      await upload(meetingId).expect(201);
    });

    it('404, если файла нет (в том числе при повторном удалении)', async () => {
      await remove(meetingId).expect(404);
      await upload(meetingId).expect(201);
      await remove(meetingId).expect(204);
      await remove(meetingId).expect(404);
    });

    it('404 для чужой встречи, файл остаётся', async () => {
      await upload(meetingId).expect(201);

      await remove(meetingId, otherAuth).expect(404);

      expect(await prisma.meetingFile.count()).toBe(1);
      expect(await filesOnDisk()).toHaveLength(1);
    });

    it('404 для несуществующей встречи', async () => {
      await remove(missingId).expect(404);
    });

    it('401 без токена', async () => {
      await upload(meetingId).expect(201);
      await remove(meetingId, {}).expect(401);
      expect(await prisma.meetingFile.count()).toBe(1);
    });
  });

  describe('признак hasFile', () => {
    const getList = () =>
      request(app.getHttpServer()).get('/meetings').set(auth).expect(200);
    const getOne = () =>
      request(app.getHttpServer())
        .get(`/meetings/${meetingId}`)
        .set(auth)
        .expect(200);

    it('false у встречи без файла — в списке и в деталях', async () => {
      expect((await getList()).body[0].hasFile).toBe(false);
      expect((await getOne()).body.hasFile).toBe(false);
    });

    it('true после загрузки, и только у встречи с файлом', async () => {
      const { body: other } = await request(app.getHttpServer())
        .post('/meetings')
        .set(auth)
        .send({ title: 'Без файла' })
        .expect(201);
      expect(other.hasFile).toBe(false);
      await upload(meetingId).expect(201);

      const list = (await getList()).body as {
        id: string;
        hasFile: boolean;
      }[];
      expect(list.find((m) => m.id === meetingId)?.hasFile).toBe(true);
      expect(list.find((m) => m.id === other.id)?.hasFile).toBe(false);
      expect((await getOne()).body.hasFile).toBe(true);
    });

    it('остаётся true после замены и сбрасывается после удаления файла', async () => {
      await upload(meetingId).expect(201);
      await request(app.getHttpServer())
        .put(`/meetings/${meetingId}/file`)
        .set(auth)
        .attach('file', samples.pdf(), 'Итоги.pdf')
        .expect(200);
      expect((await getOne()).body.hasFile).toBe(true);

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/file`)
        .set(auth)
        .expect(204);

      expect((await getOne()).body.hasFile).toBe(false);
      expect((await getList()).body[0].hasFile).toBe(false);
    });

    it('чужой файл не влияет на признак', async () => {
      await upload(meetingId).expect(201);
      const { body } = await request(app.getHttpServer())
        .post('/meetings')
        .set(otherAuth)
        .send({ title: 'Чужая' })
        .expect(201);

      expect(body.hasFile).toBe(false);
      const list = await request(app.getHttpServer())
        .get('/meetings')
        .set(otherAuth)
        .expect(200);
      expect(list.body.map((m: { hasFile: boolean }) => m.hasFile)).toEqual([
        false,
      ]);
    });
  });

  describe('очистка сирот при старте', () => {
    it('после «перезапуска» (встречи в памяти пропали) записи и файлы удаляются', async () => {
      await upload(meetingId).expect(201);
      // Хвост незавершённой загрузки и файл без записи.
      await mkdir(path.join(TEST_STORAGE_DIR, 'tmp'), { recursive: true });
      await writeFile(
        path.join(TEST_STORAGE_DIR, 'tmp', randomUUID()),
        'недогруженный',
      );
      await writeFile(
        path.join(TEST_STORAGE_DIR, 'files', randomUUID()),
        'без записи',
      );
      expect(await prisma.meetingFile.count()).toBe(1);

      const restarted = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const restartedApp = restarted.createNestApplication();
      setupApp(restartedApp);
      await restartedApp.init();
      try {
        await expectNoLeftovers();
      } finally {
        await restartedApp.close();
      }
    });
  });
});
