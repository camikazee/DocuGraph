import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Bulk operations (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let ws: string;
  let owner: string;
  let viewer: string;

  const http = () => app.getHttpServer();
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function register(email: string, name: string): Promise<string> {
    const r = await request(http())
      .post('/api/v1/auth/register')
      .send({ email, name, password: 'password123' })
      .expect(201);
    return r.body.accessToken;
  }
  const create = (p: string, c: string) =>
    request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set(bearer(owner))
      .send({ file_path: p, content_raw: c })
      .expect(201);
  const byPath = (t: string, p: string) =>
    request(http())
      .get(
        `/api/v1/workspaces/${ws}/documents/by-path?path=${encodeURIComponent(p)}`,
      )
      .set(bearer(t));
  const bulk = (t: string, body: object) =>
    request(http())
      .post(`/api/v1/workspaces/${ws}/documents/bulk`)
      .set(bearer(t))
      .send(body);

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

    owner = await register('owner@bulk.test', 'Owner');
    ws = (await request(http()).get('/api/v1/auth/me').set(bearer(owner))).body
      .workspaces[0].id;
    viewer = await register('viewer@bulk.test', 'Viewer');
    const inv = await request(http())
      .post(`/api/v1/workspaces/${ws}/invitations`)
      .set(bearer(owner))
      .send({ email: 'viewer@bulk.test', role: 'viewer' })
      .expect(201);
    await request(http())
      .post('/api/v1/invitations/accept')
      .set(bearer(viewer))
      .send({ token: inv.body.token })
      .expect(201);

    await create('a.md', '# A\n\nAlpha.');
    await create('b.md', '---\ntags:\n  - keep\n---\n# B\n\nBravo.');
    await create('c.md', '# C\n\nCharlie.');
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('adds a tag across many docs, preserving existing frontmatter', async () => {
    const res = await bulk(owner, {
      op: 'addTag',
      paths: ['a.md', 'b.md'],
      tag: 'release',
    }).expect(201);
    expect(res.body.ok).toBe(2);
    expect(res.body.failed).toBe(0);

    const a = await byPath(owner, 'a.md').expect(200);
    expect(a.body.metadata.tags).toContain('release');
    const b = await byPath(owner, 'b.md').expect(200);
    // Istniejący tag zachowany.
    expect(b.body.metadata.tags).toEqual(
      expect.arrayContaining(['keep', 'release']),
    );
  });

  it('removes a tag', async () => {
    await bulk(owner, {
      op: 'removeTag',
      paths: ['b.md'],
      tag: 'keep',
    }).expect(201);
    const b = await byPath(owner, 'b.md').expect(200);
    expect(b.body.metadata.tags).not.toContain('keep');
  });

  it('moves docs into a folder (basename preserved)', async () => {
    const res = await bulk(owner, {
      op: 'move',
      paths: ['a.md', 'c.md'],
      toFolder: 'archive',
    }).expect(201);
    expect(res.body.ok).toBe(2);
    await byPath(owner, 'archive/a.md').expect(200);
    await byPath(owner, 'archive/c.md').expect(200);
    await byPath(owner, 'a.md').expect(404);
  });

  it('deletes docs', async () => {
    await bulk(owner, { op: 'delete', paths: ['archive/c.md'] }).expect(201);
    await byPath(owner, 'archive/c.md').expect(404);
  });

  it('a viewer cannot run bulk operations (403)', async () => {
    await bulk(viewer, {
      op: 'addTag',
      paths: ['b.md'],
      tag: 'nope',
    }).expect(403);
  });

  it('rejects addTag without a tag (400)', async () => {
    await bulk(owner, { op: 'addTag', paths: ['b.md'] }).expect(400);
  });

  it('reports per-path failure without aborting the batch', async () => {
    const res = await bulk(owner, {
      op: 'addTag',
      paths: ['b.md', 'ghost.md'],
      tag: 'mix',
    }).expect(201);
    expect(res.body.ok).toBe(1);
    expect(res.body.failed).toBe(1);
    const ghost = res.body.results.find(
      (r: { path: string }) => r.path === 'ghost.md',
    );
    expect(ghost.ok).toBe(false);
  });
});
