import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Content analytics (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let workspaceId: string;
  let ownerToken: string;
  let editorToken: string;
  let viewerToken: string;
  let editorUserId: string;

  const http = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = (token: string) => ({
    get: (url: string) => request(http()).get(url).set(bearer(token)),
    post: (url: string) => request(http()).post(url).set(bearer(token)),
    put: (url: string) => request(http()).put(url).set(bearer(token)),
    delete: (url: string) => request(http()).delete(url).set(bearer(token)),
  });
  const base = () => `/api/v1/workspaces/${workspaceId}/documents`;

  async function register(email: string, name: string): Promise<string> {
    const response = await request(http())
      .post('/api/v1/auth/register')
      .send({ email, name, password: 'password123' })
      .expect(201);
    return response.body.accessToken as string;
  }

  async function profile(token: string) {
    return (
      await request(http())
        .get('/api/v1/auth/me')
        .set(bearer(token))
        .expect(200)
    ).body as { user: { id: string }; workspaces: Array<{ id: string }> };
  }

  async function invite(
    email: string,
    role: 'editor' | 'viewer',
    token: string,
  ): Promise<void> {
    const invitation = await request(http())
      .post(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set(bearer(ownerToken))
      .send({ email, role })
      .expect(201);
    await request(http())
      .post('/api/v1/invitations/accept')
      .set(bearer(token))
      .send({ token: invitation.body.token })
      .expect(201);
  }

  async function createDoc(
    token: string,
    targetWorkspaceId: string,
    filePath: string,
    contentRaw: string,
  ): Promise<void> {
    await request(http())
      .post(`/api/v1/workspaces/${targetWorkspaceId}/documents`)
      .set(bearer(token))
      .send({ file_path: filePath, content_raw: contentRaw })
      .expect(201);
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

    ownerToken = await register('owner@content-analytics.test', 'Owner');
    workspaceId = (await profile(ownerToken)).workspaces[0].id;
    editorToken = await register('editor@content-analytics.test', 'Editor');
    viewerToken = await register('viewer@content-analytics.test', 'Viewer');
    editorUserId = (await profile(editorToken)).user.id;
    await invite('editor@content-analytics.test', 'editor', editorToken);
    await invite('viewer@content-analytics.test', 'viewer', viewerToken);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('records only zero-result searches and returns actionable analytics to editors', async () => {
    await createDoc(ownerToken, workspaceId, 'guides/hot.md', '# Hot');
    await createDoc(ownerToken, workspaceId, 'guides/dead.md', '# Dead');
    await api(editorToken)
      .post(`${base()}/events/read`)
      .send({ path: 'guides/hot.md', durationMs: 12000 })
      .expect(201);
    await api(editorToken)
      .post(`${base()}/events/read`)
      .send({ path: 'guides/hot.md', durationMs: 8000 })
      .expect(201);

    const successfulSearch = await api(editorToken)
      .get(`${base()}/search?q=Hot`)
      .expect(200);
    expect(Array.isArray(successfulSearch.body)).toBe(true);
    expect(successfulSearch.body).toHaveLength(1);
    await api(editorToken)
      .get(`${base()}/search?q=${encodeURIComponent('Missing API')}`)
      .expect(200, []);
    await api(editorToken)
      .get(`${base()}/search?q=${encodeURIComponent('  missing   api ')}`)
      .expect(200, []);
    await api(editorToken).get(`${base()}/search?q=x`).expect(200, []);

    const response = await api(editorToken)
      .get(`${base()}/content-analytics?days=30`)
      .expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        periodDays: 30,
        reads: 2,
        uniqueReaders: 1,
        zeroResultSearches: 2,
        mostRead: [
          expect.objectContaining({ filePath: 'guides/hot.md', reads: 2 }),
        ],
        searchesWithoutResults: [
          expect.objectContaining({ query: 'missing api', count: 2 }),
        ],
      }),
    );
    expect(JSON.stringify(response.body)).not.toContain('_id');
    expect(JSON.stringify(response.body)).not.toContain(editorUserId);
  });

  it('supports the exact periods with a 30-day default and rejects viewers', async () => {
    for (const days of [7, 30, 90]) {
      const response = await api(ownerToken)
        .get(`${base()}/content-analytics?days=${days}`)
        .expect(200);
      expect(response.body.periodDays).toBe(days);
    }
    const defaultResponse = await api(ownerToken)
      .get(`${base()}/content-analytics`)
      .expect(200);
    expect(defaultResponse.body.periodDays).toBe(30);
    await api(ownerToken)
      .get(`${base()}/content-analytics?days=14`)
      .expect(400);
    await api(viewerToken)
      .get(`${base()}/content-analytics?days=30`)
      .expect(403);
  });

  it('does not leak hidden, deleted, or cross-workspace document metrics', async () => {
    const otherOwnerToken = await register(
      'other-owner@content-analytics.test',
      'Other Owner',
    );
    const otherWorkspaceId = (await profile(otherOwnerToken)).workspaces[0].id;
    await createDoc(
      otherOwnerToken,
      otherWorkspaceId,
      'other/private.md',
      '# Other',
    );
    await request(http())
      .post(`/api/v1/workspaces/${otherWorkspaceId}/documents/events/read`)
      .set(bearer(otherOwnerToken))
      .send({ path: 'other/private.md', durationMs: 1000 })
      .expect(201);

    await createDoc(ownerToken, workspaceId, 'hidden/secret.md', '# Secret');
    await api(ownerToken)
      .put(`/api/v1/workspaces/${workspaceId}/access-rules`)
      .send({ path: 'hidden/', subjectType: 'all', level: 'none' })
      .expect(200);
    await api(ownerToken)
      .post(`${base()}/events/read`)
      .send({ path: 'hidden/secret.md', durationMs: 1000 })
      .expect(201);

    const hiddenSearch = await api(editorToken)
      .get(`${base()}/search?q=Secret`)
      .expect(200);
    expect(hiddenSearch.body).toEqual([]);

    await createDoc(ownerToken, workspaceId, 'deleted.md', '# Deleted');
    await api(ownerToken)
      .post(`${base()}/events/read`)
      .send({ path: 'deleted.md', durationMs: 1000 })
      .expect(201);
    await api(ownerToken)
      .delete(`${base()}?path=${encodeURIComponent('deleted.md')}`)
      .expect(200);

    const response = await api(editorToken)
      .get(`${base()}/content-analytics?days=90`)
      .expect(200);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('other/private.md');
    expect(serialized).not.toContain('hidden/secret.md');
    expect(serialized).not.toContain('deleted.md');
    expect(response.body.reads).toBe(2);
    expect(response.body.searchesWithoutResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ query: 'secret', count: 1 }),
      ]),
    );
  });
});
