import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;

  const user = {
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    password: 'super-secret-pw',
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    await connection.dropDatabase(); // czysty start
  });

  afterAll(async () => {
    if (connection) {
      await connection.dropDatabase();
    }
    await app?.close();
  });

  it('POST /auth/register tworzy konto, workspace i zwraca JWT', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(user)
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('POST /auth/register z istniejącym e-mailem → 409', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(user)
      .expect(409);
  });

  it('POST /auth/register odrzuca błędne dane → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', name: 'X', password: 'short' })
      .expect(400);
  });

  it('POST /auth/login zwraca JWT przy poprawnych danych', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('POST /auth/login z błędnym hasłem → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'wrong-password' })
      .expect(401);
  });

  it('GET /auth/me bez tokena → 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('GET /auth/me z tokenem zwraca profil i workspace właściciela', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(201);

    const token = login.body.accessToken as string;

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.user.email).toBe(user.email);
    expect(res.body.workspaces).toHaveLength(1);
    expect(res.body.workspaces[0].role).toBe('owner');
  });

  it('PATCH /auth/me aktualizuje profil (nazwa, username, bio, avatar)', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(201);
    const token = login.body.accessToken as string;

    const avatar =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const res = await request(app.getHttpServer())
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Jan Kowalski',
        username: 'jankowalski',
        bio: 'Maintainer of the docs.',
        avatarUrl: avatar,
      })
      .expect(200);

    expect(res.body.user).toMatchObject({
      name: 'Jan Kowalski',
      username: 'jankowalski',
      bio: 'Maintainer of the docs.',
      avatarUrl: avatar,
    });

    // odczyt potwierdza trwałość
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.user.username).toBe('jankowalski');

    // logowanie nadal działa (hasło nie zostało nadpisane)
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(201);
  });

  it('PATCH /auth/me odrzuca niepoprawny username → 400', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ username: 'has spaces!' })
      .expect(400);
  });

  it('PATCH /auth/me bez tokena → 401', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/auth/me')
      .send({ name: 'x' })
      .expect(401);
  });
});
