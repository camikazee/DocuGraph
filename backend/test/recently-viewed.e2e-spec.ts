import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Recently viewed (browsing history) (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let token: string;
  let ws: string;
  const http = () => app.getHttpServer();
  const auth = () => `Bearer ${token}`;
  const read = (path: string) =>
    request(http())
      .post(`/api/v1/workspaces/${ws}/documents/events/read`)
      .set('Authorization', auth())
      .send({ path })
      .expect(201);
  const recent = async () =>
    (
      await request(http())
        .get(`/api/v1/workspaces/${ws}/documents/recently-viewed`)
        .set('Authorization', auth())
        .expect(200)
    ).body as { filePath: string; title: string }[];

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
      .send({ email: 'rv@example.com', name: 'RV', password: 'password123' })
      .expect(201);
    token = reg.body.accessToken;
    ws = (
      await request(http()).get('/api/v1/auth/me').set('Authorization', auth())
    ).body.workspaces[0].id;
    const create = (file_path: string, content_raw: string) =>
      request(http())
        .post(`/api/v1/workspaces/${ws}/documents`)
        .set('Authorization', auth())
        .send({ file_path, content_raw })
        .expect(201);
    await create('a.md', '---\ntitle: Doc A\n---\n# A');
    await create('b.md', '# B');
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('starts empty', async () => {
    expect(await recent()).toEqual([]);
  });

  it('lists viewed docs newest-first, deduped, with titles', async () => {
    await read('a.md');
    await new Promise((r) => setTimeout(r, 10));
    await read('b.md');
    await new Promise((r) => setTimeout(r, 10));
    await read('a.md'); // re-read A → A becomes most recent

    const list = await recent();
    expect(list.map((r) => r.filePath)).toEqual(['a.md', 'b.md']);
    expect(list[0].title).toBe('Doc A');
  });

  it('drops documents that no longer exist', async () => {
    await request(http())
      .delete(`/api/v1/workspaces/${ws}/documents?path=b.md`)
      .set('Authorization', auth())
      .expect(200);
    const list = await recent();
    expect(list.map((r) => r.filePath)).toEqual(['a.md']);
  });
});
