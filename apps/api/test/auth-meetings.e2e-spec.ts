import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/setup-app.js';

describe('Auth + Meetings (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterEach(() => app.close());

  const creds = { email: 'User@Example.com', password: 'secret123' };

  it('registers, logs in and rejects bad credentials', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(creds)
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(creds)
      .expect(409);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send(creds)
      .expect(200);
    expect(login.body.accessToken).toBeTypeOf('string');
    expect(login.body.user.email).toBe('user@example.com');

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ ...creds, password: 'wrong-pass' })
      .expect(401);
  });

  it('protects meetings and returns only own meetings', async () => {
    await request(app.getHttpServer()).get('/meetings').expect(401);

    const { body } = await request(app.getHttpServer())
      .post('/auth/register')
      .send(creds);
    const auth = { Authorization: `Bearer ${body.accessToken}` };

    await request(app.getHttpServer())
      .post('/meetings')
      .set(auth)
      .send({ title: 'Планёрка' })
      .expect(201);
    const list = await request(app.getHttpServer())
      .get('/meetings')
      .set(auth)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].title).toBe('Планёрка');
  });
});
