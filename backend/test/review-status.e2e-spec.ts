import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Document review status (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let ws: string;
  let owner: string;
  let editor: string;
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
  const getStatus = (t: string) =>
    request(http())
      .get(`/api/v1/workspaces/${ws}/documents/review-status?path=guide.md`)
      .set(bearer(t));
  const setStatus = (t: string, status: string) =>
    request(http())
      .post(`/api/v1/workspaces/${ws}/documents/review-status`)
      .set(bearer(t))
      .send({ path: 'guide.md', status });

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

    owner = await register('owner@rev.test', 'Owner');
    ws = (await request(http()).get('/api/v1/auth/me').set(bearer(owner))).body
      .workspaces[0].id;
    editor = await register('editor@rev.test', 'Editor');
    viewer = await register('viewer@rev.test', 'Viewer');
    await invite('editor@rev.test', 'editor', editor);
    await invite('viewer@rev.test', 'viewer', viewer);

    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set(bearer(owner))
      .send({ file_path: 'guide.md', content_raw: '# Guide' })
      .expect(201);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('defaults to in_review with no reviewer', async () => {
    const r = await getStatus(owner).expect(200);
    expect(r.body).toEqual({ status: 'in_review', by: null, at: null });
  });

  it('an editor can approve and it records who reviewed', async () => {
    await setStatus(editor, 'approved').expect(201);
    const r = await getStatus(viewer).expect(200);
    expect(r.body.status).toBe('approved');
    expect(r.body.by).toBe('Editor');
    expect(r.body.at).toBeTruthy();
  });

  it('request changes transitions the state', async () => {
    await setStatus(owner, 'changes_requested').expect(201);
    expect((await getStatus(owner).expect(200)).body.status).toBe(
      'changes_requested',
    );
  });

  it('reopening (in_review) clears the reviewer', async () => {
    await setStatus(owner, 'in_review').expect(201);
    const r = await getStatus(owner).expect(200);
    expect(r.body).toEqual({ status: 'in_review', by: null, at: null });
  });

  it('a viewer cannot change review status (403)', async () => {
    await setStatus(viewer, 'approved').expect(403);
  });

  it('rejects an invalid status value (400)', async () => {
    await setStatus(owner, 'lgtm').expect(400);
  });

  it('notifies a watcher when changes are requested', async () => {
    // viewer watches the doc, then the owner requests changes
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/watch`)
      .set(bearer(viewer))
      .send({ path: 'guide.md', on: true })
      .expect(201);
    await setStatus(owner, 'changes_requested').expect(201);

    const notes = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/notifications`)
      .set(bearer(viewer))
      .expect(200);
    const items = Array.isArray(notes.body) ? notes.body : notes.body.items;
    expect(
      items.some(
        (n: { kind: string; filePath: string }) =>
          n.kind === 'review' && n.filePath === 'guide.md',
      ),
    ).toBe(true);
  });
});
