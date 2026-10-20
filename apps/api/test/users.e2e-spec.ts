import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { setupApp } from './../src/setup-app.js';

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let auth: { Authorization: string };
  let me: { id: string; email: string };

  const register = async (email: string) => {
    const { body } = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'secret123' })
      .expect(201);
    return {
      headers: { Authorization: `Bearer ${body.accessToken}` },
      user: body.user as { id: string; email: string },
    };
  };
  const http = () => request(app.getHttpServer());

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    await app.get(PrismaService).user.deleteMany();
    const a = await register('a@example.com');
    auth = a.headers;
    me = a.user;
  });

  afterEach(() => app.close());

  it('требует авторизацию на всех маршрутах', async () => {
    await http().get('/users').expect(401);
    await http().get('/users/me').expect(401);
    await http().patch('/users/me').send({}).expect(401);
    await http().put('/users/me/password').send({}).expect(401);
    await http().delete('/users/me').send({}).expect(401);
    await http().get(`/users/${me.id}`).expect(401);
  });

  describe('GET /users/me', () => {
    it('возвращает профиль без хеша пароля', async () => {
      const { body } = await http().get('/users/me').set(auth).expect(200);

      expect(body).toEqual({
        id: me.id,
        email: 'a@example.com',
        name: null,
        createdAt: expect.any(String),
      });
    });
  });

  describe('PATCH /users/me', () => {
    it('обновляет имя и email (с нормализацией)', async () => {
      const { body } = await http()
        .patch('/users/me')
        .set(auth)
        .send({ name: '  Анна  ', email: 'New@Example.com' })
        .expect(200);

      expect(body).toMatchObject({ name: 'Анна', email: 'new@example.com' });
      const check = await http().get('/users/me').set(auth).expect(200);
      expect(check.body.email).toBe('new@example.com');
    });

    it('пустое имя сбрасывает имя', async () => {
      await http().patch('/users/me').set(auth).send({ name: 'Анна' });
      const { body } = await http()
        .patch('/users/me')
        .set(auth)
        .send({ name: '  ' })
        .expect(200);
      expect(body.name).toBeNull();
    });

    it('400 при некорректном email', async () => {
      await http()
        .patch('/users/me')
        .set(auth)
        .send({ email: 'nope' })
        .expect(400);
    });

    it('409, если email занят', async () => {
      await register('b@example.com');
      await http()
        .patch('/users/me')
        .set(auth)
        .send({ email: 'b@example.com' })
        .expect(409);
    });
  });

  describe('PUT /users/me/password', () => {
    it('меняет пароль: старый перестаёт работать, новый работает', async () => {
      await http()
        .put('/users/me/password')
        .set(auth)
        .send({ currentPassword: 'secret123', newPassword: 'newsecret456' })
        .expect(204);

      await http()
        .post('/auth/login')
        .send({ email: 'a@example.com', password: 'secret123' })
        .expect(401);
      await http()
        .post('/auth/login')
        .send({ email: 'a@example.com', password: 'newsecret456' })
        .expect(200);
    });

    it('токен остаётся действительным после смены пароля', async () => {
      await http()
        .put('/users/me/password')
        .set(auth)
        .send({ currentPassword: 'secret123', newPassword: 'newsecret456' })
        .expect(204);
      await http().get('/users/me').set(auth).expect(200);
    });

    it('400 при неверном текущем пароле', async () => {
      await http()
        .put('/users/me/password')
        .set(auth)
        .send({ currentPassword: 'wrong-pass', newPassword: 'newsecret456' })
        .expect(400);
    });

    it('400, если новый пароль короче 6 символов', async () => {
      await http()
        .put('/users/me/password')
        .set(auth)
        .send({ currentPassword: 'secret123', newPassword: '123' })
        .expect(400);
    });
  });

  describe('DELETE /users/me', () => {
    it('удаляет аккаунт при верном пароле', async () => {
      await http()
        .delete('/users/me')
        .set(auth)
        .send({ password: 'secret123' })
        .expect(204);

      await http()
        .post('/auth/login')
        .send({ email: 'a@example.com', password: 'secret123' })
        .expect(401);
      await http().get('/users/me').set(auth).expect(404);
    });

    it('400 без пароля и аккаунт остаётся', async () => {
      await http().delete('/users/me').set(auth).send({}).expect(400);
      await http().get('/users/me').set(auth).expect(200);
    });

    it('400 при неверном пароле и аккаунт остаётся', async () => {
      await http()
        .delete('/users/me')
        .set(auth)
        .send({ password: 'wrong-pass' })
        .expect(400);
      await http().get('/users/me').set(auth).expect(200);
    });
  });

  describe('GET /users/:id', () => {
    it('возвращает публичный профиль другого пользователя', async () => {
      const b = await register('b@example.com');
      const { body } = await http()
        .get(`/users/${b.user.id}`)
        .set(auth)
        .expect(200);
      expect(body).toMatchObject({ id: b.user.id, email: 'b@example.com' });
      expect(body).not.toHaveProperty('passwordHash');
    });

    it('404, если пользователя нет', async () => {
      await http()
        .get('/users/00000000-0000-4000-8000-000000000000')
        .set(auth)
        .expect(404);
    });

    it('400, если id не UUID', async () => {
      await http().get('/users/abc').set(auth).expect(400);
    });
  });

  describe('GET /users?search=', () => {
    beforeEach(async () => {
      await register('anna@example.com');
      await register('boris@example.com');
    });

    it('без параметра возвращает всех, отсортировано по email', async () => {
      const { body } = await http().get('/users').set(auth).expect(200);
      expect(body.map((u: { email: string }) => u.email)).toEqual([
        'a@example.com',
        'anna@example.com',
        'boris@example.com',
      ]);
    });

    it('ищет по части email без учёта регистра', async () => {
      const { body } = await http()
        .get('/users')
        .query({ search: 'BOR' })
        .set(auth)
        .expect(200);
      expect(body).toHaveLength(1);
      expect(body[0].email).toBe('boris@example.com');
    });

    it('ищет по имени', async () => {
      await http().patch('/users/me').set(auth).send({ name: 'Валентина' });
      const { body } = await http()
        .get('/users')
        .query({ search: 'валент' })
        .set(auth)
        .expect(200);
      expect(body.map((u: { id: string }) => u.id)).toEqual([me.id]);
    });
  });
});
