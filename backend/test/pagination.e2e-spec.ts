import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Cursor pagination: notifications + audit (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let ownerToken: string;
  let memberToken: string;
  let ws: string;
  const DOC = 'guide/page.md';
  const http = () => app.getHttpServer();
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

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
        email: 'owner@page.test',
        name: 'Owner',
        password: 'password123',
      })
      .expect(201);
    ownerToken = owner.body.accessToken;
    ws = (await request(http()).get('/api/v1/auth/me').set(bearer(ownerToken)))
      .body.workspaces[0].id;
    const member = await request(http())
      .post('/api/v1/auth/register')
      .send({
        email: 'member@page.test',
        name: 'Member',
        password: 'password123',
      })
      .expect(201);
    memberToken = member.body.accessToken;
    const inv = await request(http())
      .post(`/api/v1/workspaces/${ws}/invitations`)
      .set(bearer(ownerToken))
      .send({ email: 'member@page.test', role: 'editor' })
      .expect(201);
    await request(http())
      .post('/api/v1/invitations/accept')
      .set(bearer(memberToken))
      .send({ token: inv.body.token })
      .expect(201);
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set(bearer(ownerToken))
      .send({ file_path: DOC, content_raw: '# Page\n\nv1' })
      .expect(201);
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/watch`)
      .set(bearer(memberToken))
      .send({ path: DOC, on: true })
      .expect(201);
    // three changes → three notifications for the member
    for (let i = 2; i <= 4; i++) {
      await request(http())
        .post(`/api/v1/workspaces/${ws}/documents`)
        .set(bearer(ownerToken))
        .send({ file_path: DOC, content_raw: `# Page\n\nv${i}` })
        .expect(201);
    }
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('paginates notifications with limit + before cursor', async () => {
    const p1 = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/notifications?limit=2`)
      .set(bearer(memberToken))
      .expect(200);
    expect(p1.body).toHaveLength(2);

    const cursor = p1.body[1].createdAt;
    const p2 = await request(http())
      .get(
        `/api/v1/workspaces/${ws}/documents/notifications?limit=2&before=${encodeURIComponent(cursor)}`,
      )
      .set(bearer(memberToken))
      .expect(200);
    // older page: at least one, all strictly older than the cursor, no overlap
    expect(p2.body.length).toBeGreaterThanOrEqual(1);
    const ids1 = new Set(p1.body.map((n: { id: string }) => n.id));
    expect(p2.body.every((n: { id: string }) => !ids1.has(n.id))).toBe(true);
    expect(new Date(p2.body[0].createdAt).getTime()).toBeLessThan(
      new Date(cursor).getTime(),
    );
  });

  it('paginates the audit log with limit + before cursor', async () => {
    // generate several audit events
    for (let i = 0; i < 3; i++) {
      await request(http())
        .post(`/api/v1/workspaces/${ws}/api-keys`)
        .set(bearer(ownerToken))
        .send({ name: `k${i}` })
        .expect(201);
    }
    const p1 = await request(http())
      .get(`/api/v1/workspaces/${ws}/audit?limit=2`)
      .set(bearer(ownerToken))
      .expect(200);
    expect(p1.body).toHaveLength(2);

    const cursor = p1.body[1].createdAt;
    const p2 = await request(http())
      .get(
        `/api/v1/workspaces/${ws}/audit?limit=2&before=${encodeURIComponent(cursor)}`,
      )
      .set(bearer(ownerToken))
      .expect(200);
    const ids1 = new Set(p1.body.map((e: { id: string }) => e.id));
    expect(p2.body.every((e: { id: string }) => !ids1.has(e.id))).toBe(true);
  });
});
