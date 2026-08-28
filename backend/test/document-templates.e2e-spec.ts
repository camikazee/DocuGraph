import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Document templates (e2e)', () => {
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
  const base = () => `/api/v1/workspaces/${workspaceId}/document-templates`;

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

    ownerToken = await register('owner@templates.test', 'Owner');
    workspaceId = await workspaceOf(ownerToken);
    editorToken = await register('editor@templates.test', 'Editor');
    viewerToken = await register('viewer@templates.test', 'Viewer');
    await invite('editor@templates.test', 'editor', editorToken);
    await invite('viewer@templates.test', 'viewer', viewerToken);

    otherOwnerToken = await register('other@templates.test', 'Other');
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
        expect.objectContaining({ id: 'builtin:guide', builtIn: true }),
        expect.objectContaining({
          id: 'builtin:api-reference',
          builtIn: true,
        }),
        expect.objectContaining({ id: 'builtin:adr', builtIn: true }),
      ]),
    );
    expect(response.body[0]).not.toHaveProperty('_id');
  });

  it('lets an editor create, update, and delete a custom template', async () => {
    const created = await request(http())
      .post(base())
      .set(bearer(editorToken))
      .send({
        name: 'Runbook',
        description: 'Operations checklist',
        suggestedPath: 'ops/runbook.md',
        contentRaw: '# Runbook',
      })
      .expect(201);
    expect(created.body).toEqual(
      expect.objectContaining({ name: 'Runbook', builtIn: false }),
    );
    expect(created.body).not.toHaveProperty('_id');

    const updated = await request(http())
      .patch(`${base()}/${created.body.id as string}`)
      .set(bearer(editorToken))
      .send({ name: 'Incident runbook' })
      .expect(200);
    expect(updated.body.name).toBe('Incident runbook');

    await request(http())
      .delete(`${base()}/${created.body.id as string}`)
      .set(bearer(editorToken))
      .expect(204);
  });

  it('blocks viewer mutations and validates unknown fields', async () => {
    await request(http())
      .post(base())
      .set(bearer(viewerToken))
      .send({
        name: 'Nope',
        description: '',
        suggestedPath: 'nope.md',
        contentRaw: '# Nope',
      })
      .expect(403);

    await request(http())
      .post(base())
      .set(bearer(ownerToken))
      .send({
        name: 'Invalid',
        suggestedPath: 'invalid.md',
        contentRaw: '# Invalid',
        internal: true,
      })
      .expect(400);
  });

  it('rejects mutation of a built-in template', async () => {
    await request(http())
      .delete(`${base()}/${encodeURIComponent('builtin:guide')}`)
      .set(bearer(ownerToken))
      .expect(400);
  });

  it('isolates custom templates between workspaces', async () => {
    await request(http())
      .post(base())
      .set(bearer(ownerToken))
      .send({
        name: 'Private template',
        description: '',
        suggestedPath: 'private.md',
        contentRaw: '# Private',
      })
      .expect(201);

    const other = await request(http())
      .get(`/api/v1/workspaces/${otherWorkspaceId}/document-templates`)
      .set(bearer(otherOwnerToken))
      .expect(200);
    expect(other.body).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Private template' }),
      ]),
    );
  });
});
