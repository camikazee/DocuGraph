import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Bulk-fix broken links (e2e)', () => {
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
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    await connection.dropDatabase();

    const reg = await request(http())
      .post('/api/v1/auth/register')
      .send({ email: 'fixer@bulk.test', name: 'Fixer', password: 'password123' })
      .expect(201);
    token = reg.body.accessToken;
    const me = await request(http())
      .get('/api/v1/auth/me')
      .set('Authorization', auth())
      .expect(200);
    ws = me.body.workspaces[0].id;

    // Targets that exist (so a basename match is possible).
    await create('api/auth.md', '# Auth\n');
    await create('docs/guide.md', '# Guide\n');
    // Two sources with broken links pointing at wrong paths but matching basenames.
    await create('README.md', '# Readme\n\n[a](wrong/auth.md) and [g](old/guide.md).');
    await create('api/overview.md', '# Overview\n\nSee [a](./missing/auth.md).');
    // A broken link with NO possible match → must be skipped.
    await create('notes/draft.md', '# Draft\n\n[x](nope.md).');
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('reports the broken links before fixing', async () => {
    const res = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/broken-links`)
      .set('Authorization', auth())
      .expect(200);
    // 3 fixable (auth x2, guide x1) + 1 unfixable (nope.md) = 4
    expect(res.body).toHaveLength(4);
  });

  it('fixes all resolvable links in one call and skips the rest', async () => {
    const res = await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/broken-links/fix-all`)
      .set('Authorization', auth())
      .expect(201);
    expect(res.body.fixedCount).toBe(3);
    expect(res.body.skippedCount).toBe(1);
    expect(res.body.skipped[0]).toMatchObject({
      from: 'notes/draft.md',
      to: 'notes/nope.md',
    });

    // Only the unfixable one remains.
    const after = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/broken-links`)
      .set('Authorization', auth())
      .expect(200);
    expect(after.body).toHaveLength(1);
    expect(after.body[0].to).toBe('notes/nope.md');
  });

  it('rewrites the source content with correct relative paths', async () => {
    const overview = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/by-path?path=api/overview.md`)
      .set('Authorization', auth())
      .expect(200);
    // api/overview.md -> api/auth.md is a sibling, so "auth.md"
    expect(overview.body.contentRaw).toContain('](auth.md)');
    expect(overview.body.contentRaw).not.toContain('missing/auth.md');
  });
});
