import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Graph/health cache invalidation (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let token: string;
  let ws: string;
  const http = () => app.getHttpServer();
  const auth = () => `Bearer ${token}`;
  const create = (file_path: string, content_raw: string) =>
    request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', auth())
      .send({ file_path, content_raw })
      .expect(201);

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
      .send({
        email: 'cache@example.com',
        name: 'Cache',
        password: 'password123',
      })
      .expect(201);
    token = reg.body.accessToken;
    ws = (
      await request(http()).get('/api/v1/auth/me').set('Authorization', auth())
    ).body.workspaces[0].id;
    await create('a.md', '# A');
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  const graphNodes = async () =>
    (
      await request(http())
        .get(`/api/v1/workspaces/${ws}/documents/graph`)
        .set('Authorization', auth())
        .expect(200)
    ).body.nodes.length as number;

  const brokenCount = async () =>
    (
      await request(http())
        .get(`/api/v1/workspaces/${ws}/documents/health`)
        .set('Authorization', auth())
        .expect(200)
    ).body.counts.brokenLinks as number;

  it('serves a fresh graph after a document is added (cache invalidated)', async () => {
    const before = await graphNodes();
    await graphNodes(); // warm the cache
    await create('b.md', '# B');
    expect(await graphNodes()).toBe(before + 1);
  });

  it('serves a fresh health report after a broken link appears', async () => {
    expect(await brokenCount()).toBe(0);
    await brokenCount(); // warm the cache
    await create('c.md', '# C\n\n[x](nope.md)');
    expect(await brokenCount()).toBeGreaterThanOrEqual(1);
  });
});
