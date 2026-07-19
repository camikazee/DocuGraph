import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Per-resource access control (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let ws: string;
  let owner: string;
  let dev: string; // editor, in group "dev"
  let client: string; // viewer, in group "client"
  let other: string; // editor, no group
  let devGroup: string;
  let clientGroup: string;

  const http = () => app.getHttpServer();
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function register(email: string, name: string): Promise<string> {
    const r = await request(http())
      .post('/api/v1/auth/register')
      .send({ email, name, password: 'password123' })
      .expect(201);
    return r.body.accessToken;
  }
  async function invite(email: string, role: string, token: string) {
    const inv = await request(http())
      .post(`/api/v1/workspaces/${ws}/invitations`)
      .set(bearer(owner))
      .send({ email, role })
      .expect(201);
    await request(http())
      .post('/api/v1/invitations/accept')
      .set(bearer(token))
      .send({ token: inv.body.token })
      .expect(201);
  }
  const listPaths = async (t: string) =>
    (
      await request(http())
        .get(`/api/v1/workspaces/${ws}/documents`)
        .set(bearer(t))
        .expect(200)
    ).body.map((d: { filePath: string }) => d.filePath);

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

    owner = await register('owner@acl.test', 'Owner');
    ws = (await request(http()).get('/api/v1/auth/me').set(bearer(owner))).body
      .workspaces[0].id;
    dev = await register('dev@acl.test', 'Dev');
    client = await register('client@acl.test', 'Client');
    other = await register('other@acl.test', 'Other');
    await invite('dev@acl.test', 'editor', dev);
    await invite('client@acl.test', 'viewer', client);
    await invite('other@acl.test', 'editor', other);

    // docs
    for (const [p, c] of [
      ['public.md', '# Public'],
      ['secret/plan.md', '# Plan'],
      ['secret/pricing.md', '# Pricing'],
    ]) {
      await request(http())
        .post(`/api/v1/workspaces/${ws}/documents`)
        .set(bearer(owner))
        .send({ file_path: p, content_raw: c })
        .expect(201);
    }

    // groups
    await request(http())
      .post(`/api/v1/workspaces/${ws}/groups`)
      .set(bearer(owner))
      .send({ name: 'dev' })
      .expect(201);
    const groups = (
      await request(http())
        .post(`/api/v1/workspaces/${ws}/groups`)
        .set(bearer(owner))
        .send({ name: 'client' })
        .expect(201)
    ).body as { id: string; name: string }[];
    devGroup = groups.find((g) => g.name === 'dev')!.id;
    clientGroup = groups.find((g) => g.name === 'client')!.id;

    const members = (
      await request(http())
        .get(`/api/v1/workspaces/${ws}/members`)
        .set(bearer(owner))
        .expect(200)
    ).body as { userId: string; name: string }[];
    const uid = (name: string) => members.find((m) => m.name === name)!.userId;
    await request(http())
      .put(`/api/v1/workspaces/${ws}/groups/${devGroup}/members`)
      .set(bearer(owner))
      .send({ members: [uid('Dev')] })
      .expect(200);
    await request(http())
      .put(`/api/v1/workspaces/${ws}/groups/${clientGroup}/members`)
      .set(bearer(owner))
      .send({ members: [uid('Client')] })
      .expect(200);

    // rules: hide secret/ from everyone; dev group writes it; client reads one file
    const rule = (body: object) =>
      request(http())
        .put(`/api/v1/workspaces/${ws}/access-rules`)
        .set(bearer(owner))
        .send(body)
        .expect(200);
    await rule({ path: 'secret/', subjectType: 'all', level: 'none' });
    await rule({
      path: 'secret/',
      subjectType: 'group',
      subjectId: devGroup,
      level: 'write',
    });
    await rule({
      path: 'secret/pricing.md',
      subjectType: 'group',
      subjectId: clientGroup,
      level: 'read',
    });
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('owner sees everything (bypass)', async () => {
    expect((await listPaths(owner)).sort()).toEqual([
      'public.md',
      'secret/plan.md',
      'secret/pricing.md',
    ]);
  });

  it('dev group sees the whole secret folder', async () => {
    expect((await listPaths(dev)).sort()).toEqual([
      'public.md',
      'secret/plan.md',
      'secret/pricing.md',
    ]);
  });

  it('client sees only the revealed file inside a hidden folder', async () => {
    expect((await listPaths(client)).sort()).toEqual([
      'public.md',
      'secret/pricing.md',
    ]);
    await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/by-path?path=secret/plan.md`)
      .set(bearer(client))
      .expect(404);
    await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/by-path?path=secret/pricing.md`)
      .set(bearer(client))
      .expect(200);
  });

  it('an editor with no group cannot see or write the hidden folder', async () => {
    expect((await listPaths(other)).sort()).toEqual(['public.md']);
    await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/by-path?path=secret/plan.md`)
      .set(bearer(other))
      .expect(404);
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set(bearer(other))
      .send({ file_path: 'secret/plan.md', content_raw: '# hacked' })
      .expect(403);
  });

  it('dev group can write inside the secret folder', async () => {
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set(bearer(dev))
      .send({ file_path: 'secret/plan.md', content_raw: '# Plan v2 by dev' })
      .expect(201);
  });

  it('search and graph hide inaccessible docs for the client', async () => {
    const s = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/search?q=Plan`)
      .set(bearer(client))
      .expect(200);
    expect(
      s.body.some((r: { filePath: string }) => r.filePath === 'secret/plan.md'),
    ).toBe(false);

    const g = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/graph`)
      .set(bearer(client))
      .expect(200);
    expect(
      g.body.nodes.some(
        (n: { filePath: string }) => n.filePath === 'secret/plan.md',
      ),
    ).toBe(false);
  });
});
