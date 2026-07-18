import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Notifications for watched documents (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let ownerToken: string;
  let memberToken: string;
  let ws: string;

  const http = () => app.getHttpServer();
  const DOC = 'guide/setup.md';

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
        email: 'owner@notif.test',
        name: 'Owner',
        password: 'password123',
      })
      .expect(201);
    ownerToken = owner.body.accessToken;
    const me = await request(http())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    ws = me.body.workspaces[0].id;

    const member = await request(http())
      .post('/api/v1/auth/register')
      .send({
        email: 'member@notif.test',
        name: 'Member',
        password: 'password123',
      })
      .expect(201);
    memberToken = member.body.accessToken;

    const inv = await request(http())
      .post(`/api/v1/workspaces/${ws}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'member@notif.test', role: 'editor' })
      .expect(201);
    await request(http())
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ token: inv.body.token })
      .expect(201);

    // Owner creates the document (first creation must NOT notify anyone).
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ file_path: DOC, content_raw: '# Setup\n\nv1' })
      .expect(201);

    // Member watches it.
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/watch`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ path: DOC, on: true })
      .expect(201);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('starts with no notifications', async () => {
    const res = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/notifications/count`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(res.body.unread).toBe(0);
  });

  it('notifies a watcher when someone else changes the document', async () => {
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ file_path: DOC, content_raw: '# Setup\n\nv2 — updated' })
      .expect(201);

    const count = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/notifications/count`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(count.body.unread).toBe(1);

    const list = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/notifications`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      filePath: DOC,
      kind: 'changed',
      actor: 'Owner',
      read: false,
    });
  });

  it('does not notify the actor about their own change', async () => {
    // Owner also watches the doc, then edits it themselves.
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/watch`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ path: DOC, on: true })
      .expect(201);
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ file_path: DOC, content_raw: '# Setup\n\nv3 — by owner' })
      .expect(201);

    const owner = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/notifications/count`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(owner.body.unread).toBe(0);
    // member got a second notification though
    const member = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/notifications/count`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(member.body.unread).toBe(2);
  });

  it('marks one notification as read', async () => {
    const list = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/notifications`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    const id = list.body[0].id;
    const res = await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/notifications/${id}/read`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(201);
    expect(res.body.unread).toBe(1);
  });

  it('marks all notifications as read', async () => {
    const res = await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/notifications/read-all`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(201);
    expect(res.body.unread).toBe(0);

    const unreadOnly = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/notifications?unread=1`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(unreadOnly.body).toHaveLength(0);
  });

  it('notifies watchers when someone comments on a watched document', async () => {
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ path: DOC, line: 1, quote: '# Setup', body: 'Looks good?' })
      .expect(201);

    const list = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/notifications?unread=1`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    const comment = list.body.find(
      (n: { kind: string }) => n.kind === 'comment',
    );
    expect(comment).toMatchObject({
      kind: 'comment',
      filePath: DOC,
      actor: 'Owner',
    });
  });

  it('notifies a mentioned member with a mention notification', async () => {
    const members = await request(http())
      .get(`/api/v1/workspaces/${ws}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const memberUuid = members.body.find(
      (m: { name: string; userId: string }) => m.name === 'Member',
    ).userId;

    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        path: DOC,
        line: 1,
        body: 'ping @Member',
        mentions: [memberUuid],
      })
      .expect(201);

    const list = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/notifications?unread=1`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    const mention = list.body.find(
      (n: { kind: string }) => n.kind === 'mention',
    );
    expect(mention).toMatchObject({
      kind: 'mention',
      filePath: DOC,
      actor: 'Owner',
    });
  });

  it('notifies watchers when a watched document is moved and migrates the watch', async () => {
    const NEW = 'guide/installation.md';
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ from: DOC, to: NEW })
      .expect(201);

    // the watcher (member) is notified with kind 'moved' pointing at the new path
    const list = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/notifications`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    const moved = list.body.find((n: { kind: string }) => n.kind === 'moved');
    expect(moved).toMatchObject({
      kind: 'moved',
      filePath: NEW,
      actor: 'Owner',
    });

    // the watch itself follows the file
    const watching = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/watching`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(watching.body).toContain(NEW);
    expect(watching.body).not.toContain(DOC);
  });
});
