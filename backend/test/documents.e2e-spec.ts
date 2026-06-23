import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { promises as fs } from 'fs';
import * as path from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import {
  Membership,
  MembershipDocument,
} from '../src/workspaces/schemas/membership.schema';
import {
  Workspace,
  WorkspaceDocument,
} from '../src/workspaces/schemas/workspace.schema';
import { Role } from '../src/common/enums/role.enum';
import { internalUserId } from './uuid-helper';

describe('Documents pipeline (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let membershipModel: Model<MembershipDocument>;
  let workspaceModel: Model<WorkspaceDocument>;

  let ownerToken: string;
  let workspaceId: string; // public uuid
  let internalWsId: string; // internal _id (disk path, direct DB ops)
  let otherWorkspaceId: string;
  let ciToken: string;

  async function register(email: string, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, name, password: 'password123' })
      .expect(201);
    return res.body.accessToken as string;
  }

  async function workspaceOf(token: string): Promise<string> {
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return me.body.workspaces[0].id as string;
  }

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
    membershipModel = app.get<Model<MembershipDocument>>(
      getModelToken(Membership.name),
    );
    workspaceModel = app.get<Model<WorkspaceDocument>>(
      getModelToken(Workspace.name),
    );
    await connection.dropDatabase();

    ownerToken = await register('owner@example.com', 'Owner');
    workspaceId = await workspaceOf(ownerToken);
    internalWsId = (await workspaceModel
      .findOne({ uuid: workspaceId })
      .exec())!._id.toString();

    const otherToken = await register('other@example.com', 'Other');
    otherWorkspaceId = await workspaceOf(otherToken);

    const key = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/api-keys`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'CI' })
      .expect(201);
    ciToken = key.body.token as string;
  });

  afterAll(async () => {
    if (connection) {
      await connection.dropDatabase();
    }
    await app?.close();
  });

  function upsert(token: string, body: unknown, ws = workspaceId) {
    return request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);
  }

  it('upsert (JWT) zapisuje plik na dysk i mirror w Mongo', async () => {
    const content = [
      '---',
      'title: Auth Guide',
      'tags: [auth, security]',
      '---',
      '',
      '# Auth',
      '',
      'See [docker](../devops/docker.md).',
    ].join('\n');

    const res = await upsert(ownerToken, {
      file_path: 'docs/api/auth.md',
      content_raw: content,
    }).expect(201);

    expect(res.body.title).toBe('Auth Guide');
    expect(res.body.metadata.tags).toEqual(['auth', 'security']);
    expect(res.body.contentHtml).toContain('<h1>Auth</h1>');
    expect(res.body.links.outgoing).toContain('docs/devops/docker.md');

    // Plik faktycznie na dysku.
    const full = path.join(
      process.env.WORKSPACE_ROOT as string,
      internalWsId,
      'docs/api/auth.md',
    );
    const onDisk = await fs.readFile(full, 'utf8');
    expect(onDisk).toBe(content);
  });

  it('getByPath zwraca wyrenderowany dokument', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/documents/by-path`)
      .query({ path: 'docs/api/auth.md' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.title).toBe('Auth Guide');
    expect(res.body.contentHtml).toContain('<h1>Auth</h1>');
  });

  it('list zwraca dokumenty workspace', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/documents`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      res.body.some(
        (d: { filePath: string }) => d.filePath === 'docs/api/auth.md',
      ),
    ).toBe(true);
  });

  it('upsert jest idempotentny po (workspace, file_path)', async () => {
    await upsert(ownerToken, {
      file_path: 'docs/api/auth.md',
      content_raw: '# Updated\n',
    }).expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/documents`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const matches = res.body.filter(
      (d: { filePath: string }) => d.filePath === 'docs/api/auth.md',
    );
    expect(matches).toHaveLength(1);
  });

  it('path traversal → 400', async () => {
    await upsert(ownerToken, {
      file_path: '../escape.md',
      content_raw: 'x',
    }).expect(400);
  });

  it('token CI może wgrać dokument', async () => {
    const res = await upsert(ciToken, {
      file_path: 'ci/generated.md',
      content_raw: '# From CI\n',
    }).expect(201);
    expect(res.body.title).toBe('From CI');
    expect(res.body.updatedBy).toBeNull();
  });

  it('token CI dla obcego workspace → 403', async () => {
    await upsert(
      ciToken,
      { file_path: 'x.md', content_raw: 'x' },
      otherWorkspaceId,
    ).expect(403);
  });

  it('viewer nie może wgrywać → 403', async () => {
    const viewerToken = await register('viewer@example.com', 'Viewer');
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    await membershipModel.create({
      workspaceId: internalWsId,
      userId: await internalUserId(app, me.body.user.id as string),
      role: Role.Viewer,
    });

    await upsert(viewerToken, {
      file_path: 'docs/nope.md',
      content_raw: 'x',
    }).expect(403);
  });

  it('move zmienia ścieżkę i refaktoryzuje backlinki (Algorytm B)', async () => {
    // cel + dokument linkujący do niego
    await upsert(ownerToken, {
      file_path: 'guide/setup.md',
      content_raw: '# Setup\n',
    }).expect(201);
    await upsert(ownerToken, {
      file_path: 'index.md',
      content_raw: '# Index\n\nSee [setup](guide/setup.md).',
    }).expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/documents/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ from: 'guide/setup.md', to: 'manual/install.md' })
      .expect(201);
    expect(res.body).toMatchObject({
      moved: true,
      to: 'manual/install.md',
      refactoredLinks: 1,
    });

    // stary dokument zniknął, nowy istnieje
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/documents/by-path`)
      .query({ path: 'guide/setup.md' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);

    // linkujący dokument został przepisany na nową ścieżkę
    const idx = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/documents/by-path`)
      .query({ path: 'index.md' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(idx.body.links.outgoing).toContain('manual/install.md');
    expect(idx.body.contentRaw).toContain('](manual/install.md)');

    // backlink przychodzący na nowym dokumencie
    const moved = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/documents/by-path`)
      .query({ path: 'manual/install.md' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(moved.body.links.incoming).toContain('index.md');
  });

  it('move na istniejącą ścieżkę → 400', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/documents/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ from: 'index.md', to: 'manual/install.md' })
      .expect(400);
  });

  it('komentarze: dodanie (JWT) i resolve wątku', async () => {
    await upsert(ownerToken, {
      file_path: 'reviewable.md',
      content_raw: '# Title\n\nFirst block.\n\nSecond block.',
    }).expect(201);

    const added = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/documents/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ path: 'reviewable.md', line: 1, body: 'Needs detail.' })
      .expect(201);
    expect(added.body).toHaveLength(1);
    expect(added.body[0]).toMatchObject({
      line: 1,
      body: 'Needs detail.',
      resolved: false,
      author: 'Owner',
    });

    const resolved = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/documents/comments/resolve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ path: 'reviewable.md', line: 1, resolved: true })
      .expect(201);
    expect(resolved.body[0].resolved).toBe(true);
  });

  it('komentarz przez token CI (brak usera) → 400', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/documents/comments`)
      .set('Authorization', `Bearer ${ciToken}`)
      .send({ path: 'reviewable.md', line: 1, body: 'ci note' })
      .expect(400);
  });

  it('telemetria: odczyt liczy się w stats i na dokumencie', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/documents/events/read`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ path: 'reviewable.md', durationMs: 4000 })
      .expect(201);

    const stats = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/documents/stats`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(stats.body.reads).toBeGreaterThanOrEqual(1);
    expect(stats.body.avgReadTimeMs).toBeGreaterThan(0);

    const docs = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/documents`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const reviewable = docs.body.find(
      (d: { filePath: string }) => d.filePath === 'reviewable.md',
    );
    expect(reviewable.reads).toBeGreaterThanOrEqual(1);
  });

  it('telemetria: watch/unwatch i activeWatchers', async () => {
    const watched = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/documents/watch`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ path: 'reviewable.md', on: true })
      .expect(201);
    expect(watched.body).toContain('reviewable.md');

    const stats = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/documents/stats`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(stats.body.activeWatchers).toBeGreaterThanOrEqual(1);
    expect(stats.body.mostWatched[0].filePath).toBe('reviewable.md');

    const after = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/documents/watch`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ path: 'reviewable.md', on: false })
      .expect(201);
    expect(after.body).not.toContain('reviewable.md');

    // CI token nie może obserwować
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/documents/watch`)
      .set('Authorization', `Bearer ${ciToken}`)
      .send({ path: 'reviewable.md', on: true })
      .expect(400);
  });
});
