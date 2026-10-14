import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { setupApp } from './../src/setup-app.js';
import { TEST_STORAGE_DIR } from './test-storage.js';

describe('Meeting files (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auth: { Authorization: string };
  let otherAuth: { Authorization: string };
  let meetingId: string;

  const content = Buffer.from('содержимое тестового файла');
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

  afterEach(() => app.close());

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

    it('метаданные сохраняются в БД и доступны после перезапуска приложения', async () => {
      const uploaded = await upload(meetingId).expect(201);
      const record = await prisma.meetingFile.findUniqueOrThrow({
        where: { meetingId },
      });

      await app.close();
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      setupApp(app);
      await app.init();

      const restored = await app
        .get(PrismaService)
        .meetingFile.findUniqueOrThrow({ where: { meetingId } });
      expect(restored.id).toBe(uploaded.body.id);
      expect(
        await readFile(path.join(TEST_STORAGE_DIR, restored.storageKey)),
      ).toEqual(content);
      expect(restored.storageKey).toBe(record.storageKey);
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
});
