import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Docs health (CI gate) (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let token: string;
  let ciToken: string;
  let ws: string;

  const auth = (t: string) => `Bearer ${t}`;
  const addDoc = (file_path: string, content_raw: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', auth(token))
      .send({ file_path, content_raw })
      .expect(201);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    await connection.dropDatabase();

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'health@example.com', name: 'Health', password: 'password123' })
      .expect(201);
    token = reg.body.accessToken as string;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', auth(token))
      .expect(200);
    ws = me.body.workspaces[0].id as string;

    const key = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/api-keys`)
      .set('Authorization', auth(token))
      .send({ name: 'CI' })
      .expect(201);
    ciToken = key.body.token as string;

    await addDoc('README.md', '# Home\n\nSee the [guide](docs/guide.md).');
    await addDoc('docs/guide.md', '# Guide\n\nBack to [home](../README.md).');
    // a doc with a broken link + (it becomes) an orphan target reference
    await addDoc('api/auth.md', '# Auth\n\nTODO: [rate limits](rate-limits.md).');
    // a standalone orphan (no links in or out)
    await addDoc('notes/orphan.md', '# Orphan\n\nNothing links here and it links nowhere.');
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('reports ok=false with broken-link and orphan counts (JWT)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/documents/health`)
      .set('Authorization', auth(token))
      .expect(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.counts.documents).toBe(4);
    expect(res.body.counts.brokenLinks).toBe(1);
    expect(res.body.counts.orphans).toBeGreaterThanOrEqual(1);
    expect(res.body.brokenLinks[0]).toMatchObject({ from: 'api/auth.md', to: 'api/rate-limits.md' });
  });

  it('is reachable with a CI token (dg_live_…) — the CI gate', async () => {
    expect(ciToken.startsWith('dg_live_')).toBe(true);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/documents/health`)
      .set('Authorization', auth(ciToken))
      .expect(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.counts.brokenLinks).toBe(1);
  });

  it('reports ok=true once the broken link is fixed', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', auth(token))
      .send({ file_path: 'api/auth.md', content_raw: '# Auth\n\nNo broken links here.' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/documents/health`)
      .set('Authorization', auth(ciToken))
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.counts.brokenLinks).toBe(0);
  });
});
