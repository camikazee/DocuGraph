import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Document versions / snapshots (e2e)', () => {
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
  const put = (t: string, p: string, c: string) =>
    request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set(bearer(t))
      .send({ file_path: p, content_raw: c });
  const publish = (t: string, label: string) =>
    request(http())
      .post(`/api/v1/workspaces/${ws}/document-versions`)
      .set(bearer(t))
      .send({ label });

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

    owner = await register('owner@ver.test', 'Owner');
    ws = (await request(http()).get('/api/v1/auth/me').set(bearer(owner))).body
      .workspaces[0].id;
    viewer = await register('viewer@ver.test', 'Viewer');
    const inv = await request(http())
      .post(`/api/v1/workspaces/${ws}/invitations`)
      .set(bearer(owner))
      .send({ email: 'viewer@ver.test', role: 'viewer' })
      .expect(201);
    await request(http())
      .post('/api/v1/invitations/accept')
      .set(bearer(viewer))
      .send({ token: inv.body.token })
      .expect(201);

    await put(owner, 'guide.md', '# Guide\n\nVersion one text.').expect(201);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('publishes a snapshot and lists it', async () => {
    const res = await publish(owner, 'v1.0').expect(201);
    expect(res.body.label).toBe('v1.0');
    expect(res.body.docCount).toBe(1);

    const list = await request(http())
      .get(`/api/v1/workspaces/${ws}/document-versions`)
      .set(bearer(viewer))
      .expect(200);
    expect(list.body[0].label).toBe('v1.0');
    expect(list.body[0].by).toBe('Owner');
  });

  it('the snapshot is frozen — later edits do not change it', async () => {
    // change the live doc after publishing v1.0
    await put(owner, 'guide.md', '# Guide\n\nVersion two text.').expect(201);

    const versions = await request(http())
      .get(`/api/v1/workspaces/${ws}/document-versions`)
      .set(bearer(owner))
      .expect(200);
    const vid = versions.body.find(
      (v: { label: string }) => v.label === 'v1.0',
    ).id;

    const snap = await request(http())
      .get(
        `/api/v1/workspaces/${ws}/document-versions/${vid}/by-path?path=guide.md`,
      )
      .set(bearer(owner))
      .expect(200);
    expect(snap.body.contentHtml).toContain('Version one text');
    expect(snap.body.contentHtml).not.toContain('Version two text');

    // live doc reflects the edit
    const live = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/by-path?path=guide.md`)
      .set(bearer(owner))
      .expect(200);
    expect(live.body.contentHtml).toContain('Version two text');
  });

  it('lists documents inside a version', async () => {
    const versions = await request(http())
      .get(`/api/v1/workspaces/${ws}/document-versions`)
      .set(bearer(owner))
      .expect(200);
    const vid = versions.body[0].id;
    const docs = await request(http())
      .get(`/api/v1/workspaces/${ws}/document-versions/${vid}/documents`)
      .set(bearer(viewer))
      .expect(200);
    expect(docs.body.map((d: { filePath: string }) => d.filePath)).toContain(
      'guide.md',
    );
  });

  it('rejects a duplicate label (400)', async () => {
    await publish(owner, 'v1.0').expect(400);
  });

  it('a viewer cannot publish (403)', async () => {
    await publish(viewer, 'v9.9').expect(403);
  });

  it('only an owner can delete a version', async () => {
    const editor = await register('editor@ver.test', 'Editor');
    const inv = await request(http())
      .post(`/api/v1/workspaces/${ws}/invitations`)
      .set(bearer(owner))
      .send({ email: 'editor@ver.test', role: 'editor' })
      .expect(201);
    await request(http())
      .post('/api/v1/invitations/accept')
      .set(bearer(editor))
      .send({ token: inv.body.token })
      .expect(201);

    const versions = await request(http())
      .get(`/api/v1/workspaces/${ws}/document-versions`)
      .set(bearer(owner))
      .expect(200);
    const vid = versions.body[0].id;

    await request(http())
      .delete(`/api/v1/workspaces/${ws}/document-versions/${vid}`)
      .set(bearer(editor))
      .expect(403);
    await request(http())
      .delete(`/api/v1/workspaces/${ws}/document-versions/${vid}`)
      .set(bearer(owner))
      .expect(200);
  });
});
