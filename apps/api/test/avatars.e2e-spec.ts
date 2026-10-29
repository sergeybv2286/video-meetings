import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { mkdir, readdir, rm } from 'node:fs/promises';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { setupApp } from './../src/setup-app.js';
import { imageSamples, samples } from './sample-files.js';
import { TEST_AVATARS_DIR } from './test-storage.js';

describe('Avatars (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auth: { Authorization: string };
  let otherAuth: { Authorization: string };
  let userId: string;

  const missingId = '00000000-0000-0000-0000-000000000000';

  const register = async (email: string) => {
    const { body } = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'secret123' })
      .expect(201);
    const me = await request(app.getHttpServer())
      .get('/users/me')
      .set({ Authorization: `Bearer ${body.accessToken}` })
      .expect(200);
    return {
      headers: { Authorization: `Bearer ${body.accessToken}` },
      id: me.body.id as string,
    };
  };

  const put = (
    content: Buffer,
    name = 'me.png',
    headers: { Authorization?: string } = auth,
  ) =>
    request(app.getHttpServer())
      .put('/users/me/avatar')
      .set(headers)
      .attach('file', content, name);

  const filesOnDisk = () => readdir(TEST_AVATARS_DIR).catch(() => []);

  beforeEach(async () => {
    await rm(TEST_AVATARS_DIR, { recursive: true, force: true });
    await mkdir(TEST_AVATARS_DIR, { recursive: true });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany();
    const first = await register('a@example.com');
    auth = first.headers;
    userId = first.id;
    otherAuth = (await register('b@example.com')).headers;
  });

  afterEach(async () => {
    await app.close();
  });

  it('401 без токена', async () => {
    await request(app.getHttpServer())
      .put('/users/me/avatar')
      .attach('file', imageSamples.png(), 'me.png')
      .expect(401);
    await request(app.getHttpServer())
      .get(`/users/${userId}/avatar`)
      .expect(401);
    await request(app.getHttpServer()).delete('/users/me/avatar').expect(401);
  });

  it('PUT загружает аватар, GET отдаёт его любому авторизованному', async () => {
    const content = imageSamples.png();
    const { body } = await put(content).expect(200);
    expect(body).toMatchObject({ mimeType: 'image/png', size: content.length });
    expect(await filesOnDisk()).toHaveLength(1);

    const res = await request(app.getHttpServer())
      .get(`/users/${userId}/avatar`)
      .set(otherAuth)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body.equals(content)).toBe(true);
  });

  it('принимает JPEG и WebP', async () => {
    await put(imageSamples.jpeg(), 'a.jpg').expect(200);
    const { body } = await put(imageSamples.webp(), 'a.webp').expect(200);
    expect(body.mimeType).toBe('image/webp');
  });

  it('замена удаляет старый файл с диска', async () => {
    await put(imageSamples.png()).expect(200);
    const [before] = await filesOnDisk();
    await put(imageSamples.jpeg(), 'b.jpg').expect(200);
    const after = await filesOnDisk();
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(before);
    expect(await prisma.userAvatar.count()).toBe(1);
  });

  it('подменённое расширение → 415, прежний аватар сохраняется', async () => {
    await put(imageSamples.png()).expect(200);
    const [kept] = await filesOnDisk();
    const res = await put(samples.exe(), 'virus.png').expect(415);
    expect(res.body.message).toContain('JPEG, PNG или WebP');
    expect(await filesOnDisk()).toEqual([kept]);
    const stored = await prisma.userAvatar.findUniqueOrThrow({
      where: { userId },
    });
    expect(stored.mimeType).toBe('image/png');
  });

  it('файл больше 5 МБ → 413', async () => {
    const big = Buffer.concat([
      imageSamples.png(),
      Buffer.alloc(5 * 1024 * 1024),
    ]);
    const res = await put(big).expect(413);
    expect(res.body.message).toContain('5 МБ');
    expect(await filesOnDisk()).toHaveLength(0);
  });

  it('без файла → 400, пустой файл → 400', async () => {
    await request(app.getHttpServer())
      .put('/users/me/avatar')
      .set(auth)
      .field('x', '1')
      .expect(400);
    await put(Buffer.alloc(0)).expect(400);
  });

  it('GET → 404, если аватара нет или пользователя нет; 400 для не-UUID', async () => {
    await request(app.getHttpServer())
      .get(`/users/${userId}/avatar`)
      .set(auth)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/users/${missingId}/avatar`)
      .set(auth)
      .expect(404);
    await request(app.getHttpServer())
      .get('/users/not-a-uuid/avatar')
      .set(auth)
      .expect(400);
  });

  it('GET → 404, если файл пропал с диска', async () => {
    await put(imageSamples.png()).expect(200);
    await rm(TEST_AVATARS_DIR, { recursive: true, force: true });
    await request(app.getHttpServer())
      .get(`/users/${userId}/avatar`)
      .set(auth)
      .expect(404);
  });

  it('PUT удалённого пользователя с живым токеном → 401, файл не остаётся', async () => {
    await prisma.user.delete({ where: { id: userId } });
    await put(imageSamples.png()).expect(401);
    expect(await filesOnDisk()).toHaveLength(0);
  });

  it('DELETE удаляет запись и файл; повторный → 404', async () => {
    await put(imageSamples.png()).expect(200);
    await request(app.getHttpServer())
      .delete('/users/me/avatar')
      .set(auth)
      .expect(204);
    expect(await filesOnDisk()).toHaveLength(0);
    expect(await prisma.userAvatar.count()).toBe(0);
    await request(app.getHttpServer())
      .delete('/users/me/avatar')
      .set(auth)
      .expect(404);
  });

  it('чужой аватар нельзя изменить или удалить: операции действуют на свой', async () => {
    await put(imageSamples.png()).expect(200);
    await request(app.getHttpServer())
      .delete('/users/me/avatar')
      .set(otherAuth)
      .expect(404);
    await request(app.getHttpServer())
      .put(`/users/${userId}/avatar`)
      .set(otherAuth)
      .attach('file', imageSamples.png(), 'x.png')
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/users/${userId}/avatar`)
      .set(otherAuth)
      .expect(404);
    expect(await prisma.userAvatar.count()).toBe(1);
    expect(await filesOnDisk()).toHaveLength(1);
  });
});
