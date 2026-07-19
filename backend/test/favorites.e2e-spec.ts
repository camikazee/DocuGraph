import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Favorites (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let token: string;
  let ws: string;
  const http = () => app.getHttpServer();
  const auth = () => `Bearer ${token}`;

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
    await connection.dropDatabase();

    const reg = await request(http())
      .post('/api/v1/auth/register')
      .send({ email: 'fav@example.com', name: 'Fav', password: 'password123' })
      .expect(201);
    token = reg.body.accessToken;
    ws = (
      await request(http()).get('/api/v1/auth/me').set('Authorization', auth())
    ).body.workspaces[0].id;
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', auth())
      .send({ file_path: 'a.md', content_raw: '# A' })
      .expect(201);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('starts empty, adds and removes a favorite', async () => {
    const empty = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/favorites`)
      .set('Authorization', auth())
      .expect(200);
    expect(empty.body).toEqual([]);

    const added = await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/favorite`)
      .set('Authorization', auth())
      .send({ path: 'a.md', on: true })
      .expect(201);
    expect(added.body).toContain('a.md');

    // idempotent — starring again keeps a single entry
    const again = await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/favorite`)
      .set('Authorization', auth())
      .send({ path: 'a.md', on: true })
      .expect(201);
    expect(again.body.filter((p: string) => p === 'a.md')).toHaveLength(1);

    const removed = await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/favorite`)
      .set('Authorization', auth())
      .send({ path: 'a.md', on: false })
      .expect(201);
    expect(removed.body).not.toContain('a.md');
  });
});
