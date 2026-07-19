import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Public share links (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let ws: string;
  let owner: string;
  let viewer: string;

  const http = () => app.getHttpServer();
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const tokenOf = (url: string) => url.split('/share/')[1];

  async function register(email: string, name: string): Promise<string> {
    const r = await request(http())
      .post('/api/v1/auth/register')
      .send({ email, name, password: 'password123' })
      .expect(201);
    return r.body.accessToken;
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
    await connection.dropDatabase();

    owner = await register('owner@share.test', 'Owner');
    ws = (await request(http()).get('/api/v1/auth/me').set(bearer(owner))).body
      .workspaces[0].id;
    viewer = await register('viewer@share.test', 'Viewer');
    const inv = await request(http())
      .post(`/api/v1/workspaces/${ws}/invitations`)
      .set(bearer(owner))
      .send({ email: 'viewer@share.test', role: 'viewer' })
      .expect(201);
    await request(http())
      .post('/api/v1/invitations/accept')
      .set(bearer(viewer))
      .send({ token: inv.body.token })
      .expect(201);

    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set(bearer(owner))
      .send({ file_path: 'guide.md', content_raw: '# Guide\n\nHello world.' })
      .expect(201);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  const createLink = (t: string, body: object = { path: 'guide.md' }) =>
    request(http())
      .post(`/api/v1/workspaces/${ws}/documents/share-links`)
      .set(bearer(t))
      .send(body);

  it('a public reader can open a shared doc with no auth', async () => {
    const created = await createLink(owner).expect(201);
    expect(created.body.url).toContain('/share/');
    const token = tokenOf(created.body.url);

    const pub = await request(http())
      .get(`/api/v1/public/docs/${token}`)
      .expect(200);
    expect(pub.body.title).toBe('Guide');
    expect(pub.body.html).toContain('Hello world');
    expect(pub.body.workspaceName).toBeTruthy();
    // No internal identifiers leak.
    expect(JSON.stringify(pub.body)).not.toContain('_id');
  });

  it('revoking a link makes it 404 for the public', async () => {
    const created = await createLink(owner).expect(201);
    const token = tokenOf(created.body.url);
    await request(http()).get(`/api/v1/public/docs/${token}`).expect(200);

    const links = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/share-links?path=guide.md`)
      .set(bearer(owner))
      .expect(200);
    const id = links.body[0].id;
    await request(http())
      .delete(
        `/api/v1/workspaces/${ws}/documents/share-links/${id}?path=guide.md`,
      )
      .set(bearer(owner))
      .expect(200);

    await request(http()).get(`/api/v1/public/docs/${token}`).expect(404);
  });

  it('a viewer (no write access) cannot create a link', async () => {
    await createLink(viewer).expect(403);
  });

  it('an unknown token is 404', async () => {
    await request(http())
      .get(`/api/v1/public/docs/dgs_${'0'.repeat(64)}`)
      .expect(404);
  });

  it('cannot share a non-existent document', async () => {
    await createLink(owner, { path: 'nope.md' }).expect(404);
  });
});
