import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { setupApp } from './../src/setup-app.js';

describe('Meetings (e2e)', () => {
  let app: INestApplication<App>;
  let auth: { Authorization: string };
  let otherAuth: { Authorization: string };

  const register = async (email: string) => {
    const { body } = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'secret123' })
      .expect(201);
    return { Authorization: `Bearer ${body.accessToken}` };
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    await app.get(PrismaService).user.deleteMany();
    auth = await register('a@example.com');
    otherAuth = await register('b@example.com');
  });

  afterEach(() => app.close());

  const payload = {
    title: '  Планёрка ',
    date: '2026-11-01T10:00:00.000Z',
    participants: ['anna@example.com', 'boris@example.com'],
  };

  describe('POST /meetings', () => {
    it('создаёт встречу с title, date и participants', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/meetings')
        .set(auth)
        .send(payload)
        .expect(201);
      expect(body).toMatchObject({
        title: 'Планёрка',
        date: '2026-11-01T10:00:00.000Z',
        participants: payload.participants,
      });
      expect(body.id).toBeTypeOf('string');
    });

    it('date и participants необязательны', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/meetings')
        .set(auth)
        .send({ title: 'Быстрая' })
        .expect(201);
      expect(body.participants).toEqual([]);
      expect(body.date).toBe(body.createdAt);
    });

    it.each([
      ['пустой title', { title: '' }],
      ['title не задан', { date: '2026-11-01T10:00:00.000Z' }],
      ['невалидная дата', { title: 'x', date: 'вчера' }],
      ['participants не массив', { title: 'x', participants: 'a' }],
      ['участник не строка', { title: 'x', participants: [1] }],
    ])('400: %s', async (_name, body) => {
      await request(app.getHttpServer())
        .post('/meetings')
        .set(auth)
        .send(body)
        .expect(400);
    });

    it('401 без токена', async () => {
      await request(app.getHttpServer())
        .post('/meetings')
        .send(payload)
        .expect(401);
    });
  });

  describe('GET /meetings', () => {
    it('возвращает только встречи текущего пользователя', async () => {
      await request(app.getHttpServer())
        .post('/meetings')
        .set(auth)
        .send(payload)
        .expect(201);
      await request(app.getHttpServer())
        .post('/meetings')
        .set(otherAuth)
        .send({ title: 'Чужая' })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .get('/meetings')
        .set(auth)
        .expect(200);
      expect(body).toHaveLength(1);
      expect(body[0].title).toBe('Планёрка');
    });

    it('401 без токена', async () => {
      await request(app.getHttpServer()).get('/meetings').expect(401);
    });
  });

  describe('GET /meetings/:id', () => {
    it('возвращает встречу по id', async () => {
      const created = await request(app.getHttpServer())
        .post('/meetings')
        .set(auth)
        .send(payload)
        .expect(201);
      const { body } = await request(app.getHttpServer())
        .get(`/meetings/${created.body.id}`)
        .set(auth)
        .expect(200);
      expect(body).toEqual(created.body);
    });

    it('404, если встречи нет', async () => {
      await request(app.getHttpServer())
        .get('/meetings/00000000-0000-0000-0000-000000000000')
        .set(auth)
        .expect(404);
    });

    it('404 для чужой встречи', async () => {
      const created = await request(app.getHttpServer())
        .post('/meetings')
        .set(auth)
        .send(payload)
        .expect(201);
      await request(app.getHttpServer())
        .get(`/meetings/${created.body.id}`)
        .set(otherAuth)
        .expect(404);
    });

    it('401 без токена', async () => {
      await request(app.getHttpServer())
        .get('/meetings/00000000-0000-0000-0000-000000000000')
        .expect(401);
    });
  });
});
