import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Audit log (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let ownerToken: string;
  let memberToken: string;
  let ws: string;
  let memberUserId: string;

  const http = () => app.getHttpServer();
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const auditActions = async (token = ownerToken): Promise<string[]> => {
    const res = await request(http())
      .get(`/api/v1/workspaces/${ws}/audit`)
      .set(bearer(token))
      .expect(200);
    return res.body.map((e: { action: string }) => e.action);
  };

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

    const owner = await request(http())
      .post('/api/v1/auth/register')
      .send({
        email: 'owner@audit.test',
        name: 'AuditOwner',
        password: 'password123',
      })
      .expect(201);
    ownerToken = owner.body.accessToken;
    ws = (
      await request(http())
        .get('/api/v1/auth/me')
        .set(bearer(ownerToken))
        .expect(200)
    ).body.workspaces[0].id;

    const member = await request(http())
      .post('/api/v1/auth/register')
      .send({
        email: 'member@audit.test',
        name: 'AuditMember',
        password: 'password123',
      })
      .expect(201);
    memberToken = member.body.accessToken;

    // invitation.created -> member.joined
    const inv = await request(http())
      .post(`/api/v1/workspaces/${ws}/invitations`)
      .set(bearer(ownerToken))
      .send({ email: 'member@audit.test', role: 'editor' })
      .expect(201);
    await request(http())
      .post('/api/v1/invitations/accept')
      .set(bearer(memberToken))
      .send({ token: inv.body.token })
      .expect(201);

    const members = await request(http())
      .get(`/api/v1/workspaces/${ws}/members`)
      .set(bearer(ownerToken))
      .expect(200);
    memberUserId = members.body.find(
      (m: { name: string; userId: string }) => m.name === 'AuditMember',
    ).userId;
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('records invitation + join with the right actor names', async () => {
    const res = await request(http())
      .get(`/api/v1/workspaces/${ws}/audit`)
      .set(bearer(ownerToken))
      .expect(200);
    const actions = res.body.map((e: { action: string }) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['invitation.created', 'member.joined']),
    );

    const joined = res.body.find(
      (e: { action: string }) => e.action === 'member.joined',
    );
    expect(joined).toMatchObject({
      actor: 'AuditMember',
      target: 'member@audit.test',
    });
    const invited = res.body.find(
      (e: { action: string }) => e.action === 'invitation.created',
    );
    expect(invited.actor).toBe('AuditOwner');
    // newest first
    expect(new Date(res.body[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(res.body[res.body.length - 1].createdAt).getTime(),
    );
  });

  it('is Owner-only (a non-owner member gets 403)', async () => {
    await request(http())
      .get(`/api/v1/workspaces/${ws}/audit`)
      .set(bearer(memberToken))
      .expect(403);
  });

  it('records api key create + revoke', async () => {
    const key = await request(http())
      .post(`/api/v1/workspaces/${ws}/api-keys`)
      .set(bearer(ownerToken))
      .send({ name: 'ci-token' })
      .expect(201);
    await request(http())
      .delete(`/api/v1/workspaces/${ws}/api-keys/${key.body.id}`)
      .set(bearer(ownerToken))
      .expect(204);

    const actions = await auditActions();
    expect(actions).toEqual(
      expect.arrayContaining(['apikey.created', 'apikey.revoked']),
    );
  });

  it('records member role change with metadata', async () => {
    await request(http())
      .patch(`/api/v1/workspaces/${ws}/members/${memberUserId}`)
      .set(bearer(ownerToken))
      .send({ role: 'viewer' })
      .expect(204);

    const res = await request(http())
      .get(`/api/v1/workspaces/${ws}/audit`)
      .set(bearer(ownerToken))
      .expect(200);
    const roleChange = res.body.find(
      (e: { action: string }) => e.action === 'member.role_changed',
    );
    expect(roleChange).toMatchObject({
      actor: 'AuditOwner',
      target: memberUserId,
      metadata: { role: 'viewer' },
    });
  });

  it('records member removal', async () => {
    await request(http())
      .delete(`/api/v1/workspaces/${ws}/members/${memberUserId}`)
      .set(bearer(ownerToken))
      .expect(204);
    const actions = await auditActions();
    expect(actions).toContain('member.removed');
  });

  it('records document-level events (source config + move)', async () => {
    await request(http())
      .put(`/api/v1/workspaces/${ws}/documents/source`)
      .set(bearer(ownerToken))
      .send({ provider: 'github', repo: 'octocat/docs', branch: 'main' })
      .expect(200);

    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set(bearer(ownerToken))
      .send({ file_path: 'a.md', content_raw: '# A' })
      .expect(201);
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/move`)
      .set(bearer(ownerToken))
      .send({ from: 'a.md', to: 'b.md' })
      .expect(201);

    const res = await request(http())
      .get(`/api/v1/workspaces/${ws}/audit`)
      .set(bearer(ownerToken))
      .expect(200);
    const actions = res.body.map((e: { action: string }) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['source.configured', 'document.moved']),
    );
    const moved = res.body.find(
      (e: { action: string }) => e.action === 'document.moved',
    );
    expect(moved.target).toBe('a.md → b.md');
  });
});
