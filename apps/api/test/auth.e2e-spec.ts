import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { setupApp } from './../src/setup-app.js';

const JWT_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/;

function decodePayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    await app.get(PrismaService).user.deleteMany();
  });

  afterEach(() => app.close());

  const creds = { email: 'user@example.com', password: 'secret123' };

  const register = (body: object = creds) =>
    request(app.getHttpServer()).post('/auth/register').send(body);
  const login = (body: object = creds) =>
    request(app.getHttpServer()).post('/auth/login').send(body);

  describe('POST /auth/register', () => {
    it('создаёт пользователя и возвращает JWT', async () => {
      const res = await register().expect(201);

      expect(res.body.accessToken).toMatch(JWT_PATTERN);
      expect(res.body.user).toEqual({
        id: expect.any(String),
        email: creds.email,
      });
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('password');
    });

    it('кладёт id пользователя и версию токенов в payload, без email', async () => {
      const { body } = await register().expect(201);

      const payload = decodePayload(body.accessToken);
      expect(payload.sub).toBe(body.user.id);
      expect(payload.tv).toBe(0);
      expect(payload).not.toHaveProperty('email');
    });

    it('приводит email к нижнему регистру', async () => {
      const { body } = await register({
        email: 'User@Example.COM',
        password: creds.password,
      }).expect(201);

      expect(body.user.email).toBe('user@example.com');
    });

    it('возвращает 409 при повторной регистрации того же email', async () => {
      await register().expect(201);
      const res = await register().expect(409);

      expect(res.body.message).toBe(
        'Пользователь с таким email уже существует',
      );
    });

    it('считает email без учёта регистра при проверке дубликата', async () => {
      await register().expect(201);
      await register({
        email: 'USER@example.com',
        password: creds.password,
      }).expect(409);
    });

    it.each([
      ['невалидный email', { email: 'not-an-email', password: 'secret123' }],
      ['слишком короткий пароль', { email: 'a@b.co', password: '123' }],
      ['пустое тело', {}],
      ['пароль не строка', { email: 'a@b.co', password: 123456 }],
    ])('возвращает 400: %s', async (_name, body) => {
      const res = await register(body).expect(400);

      expect(res.body).not.toHaveProperty('accessToken');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await register().expect(201);
    });

    it('возвращает JWT при верных email и пароле', async () => {
      const res = await login().expect(200);

      expect(res.body.accessToken).toMatch(JWT_PATTERN);
      expect(res.body.user).toEqual({
        id: expect.any(String),
        email: creds.email,
      });
    });

    it('выдаёт токен с тем же пользователем, что и при регистрации', async () => {
      const reg = await register({
        email: 'other@example.com',
        password: 'secret123',
      }).expect(201);
      const res = await login({
        email: 'other@example.com',
        password: 'secret123',
      }).expect(200);

      expect(res.body.user.id).toBe(reg.body.user.id);
      expect(decodePayload(res.body.accessToken).sub).toBe(reg.body.user.id);
    });

    it('принимает email в другом регистре', async () => {
      const res = await login({
        email: 'USER@Example.com',
        password: creds.password,
      }).expect(200);

      expect(res.body.accessToken).toMatch(JWT_PATTERN);
    });

    it('возвращает 401 при неверном пароле', async () => {
      const res = await login({ ...creds, password: 'wrong-pass' }).expect(401);

      expect(res.body.message).toBe('Неверный email или пароль');
      expect(res.body).not.toHaveProperty('accessToken');
    });

    it('возвращает 401 для несуществующего пользователя с тем же сообщением', async () => {
      const res = await login({
        email: 'nobody@example.com',
        password: creds.password,
      }).expect(401);

      expect(res.body.message).toBe('Неверный email или пароль');
    });

    it.each([
      ['невалидный email', { email: 'nope', password: 'secret123' }],
      ['без пароля', { email: 'user@example.com' }],
      ['пустое тело', {}],
    ])('возвращает 400: %s', async (_name, body) => {
      await login(body).expect(400);
    });
  });

  describe('использование токена', () => {
    it.each([
      ['регистрации', () => register()],
      ['логина', async () => (await register(), login())],
    ])('токен после %s даёт доступ к GET /auth/me', async (_name, getAuth) => {
      const { body } = await getAuth();

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);

      expect(me.body.email).toBe(creds.email);
    });

    it('GET /auth/me без токена возвращает 401', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('токен удалённого пользователя возвращает 401', async () => {
      const { body } = await register();
      await app.get(PrismaService).user.deleteMany();

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(401);
    });

    it('токен с чужим алгоритмом подписи возвращает 401', async () => {
      const { body } = await register();
      const header = Buffer.from('{"alg":"none","typ":"JWT"}').toString(
        'base64url',
      );
      const [, payload] = body.accessToken.split('.');

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${header}.${payload}.`)
        .expect(401);
    });

    it('GET /auth/me с поддельным токеном возвращает 401', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer fake.token.value')
        .expect(401);
    });
  });
});
