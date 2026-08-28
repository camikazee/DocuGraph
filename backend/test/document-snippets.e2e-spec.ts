import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Document snippets (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let workspaceId: string;
  let ownerToken: string;
  let editorToken: string;
  let viewerToken: string;
  let otherWorkspaceId: string;
  let otherOwnerToken: string;

  const http = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const base = () => `/api/v1/workspaces/${workspaceId}/document-snippets`;

  async function register(email: string, name: string): Promise<string> {
    const response = await request(http())
      .post('/api/v1/auth/register')
      .send({ email, name, password: 'password123' })
      .expect(201);
    return response.body.accessToken as string;
  }

  async function workspaceOf(token: string): Promise<string> {
    const response = await request(http())
      .get('/api/v1/auth/me')
      .set(bearer(token))
      .expect(200);
    return response.body.workspaces[0].id as string;
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

    ownerToken = await register('owner@snippets.test', 'Owner');
    workspaceId = await workspaceOf(ownerToken);
    editorToken = await register('editor@snippets.test', 'Editor');
    viewerToken = await register('viewer@snippets.test', 'Viewer');
    await invite('editor@snippets.test', 'editor', editorToken);
    await invite('viewer@snippets.test', 'viewer', viewerToken);
    otherOwnerToken = await register('other@snippets.test', 'Other');
    otherWorkspaceId = await workspaceOf(otherOwnerToken);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('lists built-ins for every workspace member', async () => {
    const response = await request(http())
      .get(base())
      .set(bearer(viewerToken))
      .expect(200);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'builtin:code-block',
          builtIn: true,
        }),
        expect.objectContaining({ id: 'builtin:checklist', builtIn: true }),
        expect.objectContaining({ id: 'builtin:mermaid', builtIn: true }),
      ]),
    );
    expect(response.body[0]).not.toHaveProperty('_id');
  });

  it('lets an editor create, update, and delete a custom snippet', async () => {
    const created = await request(http())
      .post(base())
      .set(bearer(editorToken))
      .send({
        name: 'Warning',
        description: 'Important notice',
        contentRaw: '> Warning',
      })
      .expect(201);
    expect(created.body).toEqual(
      expect.objectContaining({ name: 'Warning', builtIn: false }),
    );
    expect(created.body).not.toHaveProperty('_id');

    const updated = await request(http())
      .patch(`${base()}/${created.body.id as string}`)
      .set(bearer(editorToken))
      .send({ name: 'Important warning' })
      .expect(200);
    expect(updated.body.name).toBe('Important warning');

    await request(http())
      .delete(`${base()}/${created.body.id as string}`)
      .set(bearer(editorToken))
      .expect(204);
  });

  it('blocks viewer mutations and validates unknown fields', async () => {
    await request(http())
      .post(base())
      .set(bearer(viewerToken))
      .send({ name: 'Nope', description: '', contentRaw: '> Nope' })
      .expect(403);
    await request(http())
      .post(base())
      .set(bearer(ownerToken))
      .send({ name: 'Invalid', contentRaw: '> Invalid', internal: true })
      .expect(400);
  });

  it('rejects mutation of a built-in snippet', async () => {
    await request(http())
      .delete(`${base()}/${encodeURIComponent('builtin:checklist')}`)
      .set(bearer(ownerToken))
      .expect(400);
  });

  it('isolates custom snippets between workspaces', async () => {
    await request(http())
      .post(base())
      .set(bearer(ownerToken))
      .send({
        name: 'Private snippet',
        description: '',
        contentRaw: '> Private',
      })
      .expect(201);
    const other = await request(http())
      .get(`/api/v1/workspaces/${otherWorkspaceId}/document-snippets`)
      .set(bearer(otherOwnerToken))
      .expect(200);
    expect(other.body).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Private snippet' }),
      ]),
    );
  });
});
