import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Per-kind notification muting (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let ownerToken: string;
  let memberToken: string;
  let ws: string;
  const DOC = 'guide/mute.md';
  const http = () => app.getHttpServer();
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const unread = async () =>
    (
      await request(http())
        .get(`/api/v1/workspaces/${ws}/documents/notifications/count`)
        .set(bearer(memberToken))
        .expect(200)
    ).body.unread as number;
  const edit = (body: string) =>
    request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set(bearer(ownerToken))
      .send({ file_path: DOC, content_raw: body })
      .expect(201);

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
        email: 'owner@mute.test',
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
        email: 'member@mute.test',
        name: 'Member',
        password: 'password123',
      })
      .expect(201);
    memberToken = member.body.accessToken;
    const inv = await request(http())
      .post(`/api/v1/workspaces/${ws}/invitations`)
      .set(bearer(ownerToken))
      .send({ email: 'member@mute.test', role: 'editor' })
      .expect(201);
    await request(http())
      .post('/api/v1/invitations/accept')
      .set(bearer(memberToken))
      .send({ token: inv.body.token })
      .expect(201);
    await edit('# Mute\n\nv1');
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/watch`)
      .set(bearer(memberToken))
      .send({ path: DOC, on: true })
      .expect(201);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('suppresses notifications for a muted kind', async () => {
    await request(http())
      .patch('/api/v1/notification-preferences')
      .set(bearer(memberToken))
      .send({ mutedKinds: ['changed'] })
      .expect(200);

    await edit('# Mute\n\nv2 — muted change');
    expect(await unread()).toBe(0);
  });

  it('resumes notifications once unmuted', async () => {
    await request(http())
      .patch('/api/v1/notification-preferences')
      .set(bearer(memberToken))
      .send({ mutedKinds: [] })
      .expect(200);

    await edit('# Mute\n\nv3 — change delivered again');
    expect(await unread()).toBe(1);
  });
});
