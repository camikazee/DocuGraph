import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Frontmatter schemas (e2e)', () => {
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
  const base = () => `/api/v1/workspaces/${workspaceId}/frontmatter-schemas`;
  const validSchema = {
    name: 'Release',
    description: 'Release metadata',
    fields: [
      {
        key: 'owner',
        label: 'Owner',
        type: 'text',
        required: true,
        options: [],
        defaultValue: '',
      },
      {
        key: 'stage',
        label: 'Stage',
        type: 'select',
        required: false,
        options: ['draft', 'live'],
        defaultValue: 'draft',
      },
    ],
  };

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

    ownerToken = await register('owner@frontmatter.test', 'Owner');
    workspaceId = await workspaceOf(ownerToken);
    editorToken = await register('editor@frontmatter.test', 'Editor');
    viewerToken = await register('viewer@frontmatter.test', 'Viewer');
    await invite('editor@frontmatter.test', 'editor', editorToken);
    await invite('viewer@frontmatter.test', 'viewer', viewerToken);
    otherOwnerToken = await register('other@frontmatter.test', 'Other');
    otherWorkspaceId = await workspaceOf(otherOwnerToken);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('lists the built-in schema for viewers and lets editors manage custom schemas', async () => {
    const list = await request(http())
      .get(base())
      .set(bearer(viewerToken))
      .expect(200);
    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'builtin:basic',
          name: 'Basic document',
          builtIn: true,
        }),
      ]),
    );

    const created = await request(http())
      .post(base())
      .set(bearer(editorToken))
      .send(validSchema)
      .expect(201);
    expect(created.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        builtIn: false,
        fields: validSchema.fields,
      }),
    );
    expect(created.body).not.toHaveProperty('_id');

    await request(http())
      .patch(`${base()}/${created.body.id as string}`)
      .set(bearer(editorToken))
      .send({ name: 'Release metadata' })
      .expect(200);
    await request(http())
      .delete(`${base()}/${created.body.id as string}`)
      .set(bearer(editorToken))
      .expect(204);
  });

  it('blocks viewer mutation, built-in deletion, and cross-workspace leakage', async () => {
    await request(http())
      .post(base())
      .set(bearer(viewerToken))
      .send(validSchema)
      .expect(403);
    await request(http())
      .delete(`${base()}/${encodeURIComponent('builtin:basic')}`)
      .set(bearer(ownerToken))
      .expect(400);
    await request(http())
      .post(base())
      .set(bearer(ownerToken))
      .send({ ...validSchema, name: 'Private schema' })
      .expect(201);

    const other = await request(http())
      .get(`/api/v1/workspaces/${otherWorkspaceId}/frontmatter-schemas`)
      .set(bearer(otherOwnerToken))
      .expect(200);
    expect(other.body).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Private schema' }),
      ]),
    );
  });

  it('rejects duplicate keys and invalid select defaults through the public API', async () => {
    await request(http())
      .post(base())
      .set(bearer(editorToken))
      .send({
        ...validSchema,
        fields: [validSchema.fields[0], validSchema.fields[0]],
      })
      .expect(400);
    await request(http())
      .post(base())
      .set(bearer(editorToken))
      .send({
        ...validSchema,
        fields: [
          {
            key: 'stage',
            label: 'Stage',
            type: 'select',
            required: true,
            options: ['draft'],
            defaultValue: 'live',
          },
        ],
      })
      .expect(400);
  });
});
