import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Document delete (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let ownerToken: string;
  let memberToken: string;
  let ws: string;
  const DOC = 'guide/trash.md';
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
      .send({ email: 'owner@del.test', name: 'Owner', password: 'password123' })
      .expect(201);
    ownerToken = owner.body.accessToken;
    ws = (await request(http()).get('/api/v1/auth/me').set(bearer(ownerToken)))
      .body.workspaces[0].id;
    const member = await request(http())
      .post('/api/v1/auth/register')
      .send({
        email: 'member@del.test',
        name: 'Member',
        password: 'password123',
      })
      .expect(201);
    memberToken = member.body.accessToken;
    const inv = await request(http())
      .post(`/api/v1/workspaces/${ws}/invitations`)
      .set(bearer(ownerToken))
      .send({ email: 'member@del.test', role: 'editor' })
      .expect(201);
    await request(http())
      .post('/api/v1/invitations/accept')
      .set(bearer(memberToken))
      .send({ token: inv.body.token })
      .expect(201);
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set(bearer(ownerToken))
      .send({ file_path: DOC, content_raw: '# Trash\n\nbye' })
      .expect(201);
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

  it('deletes the document, notifies watchers, and records an audit event', async () => {
    await request(http())
      .delete(
        `/api/v1/workspaces/${ws}/documents?path=${encodeURIComponent(DOC)}`,
      )
      .set(bearer(ownerToken))
      .expect(200);

    // gone
    await request(http())
      .get(
        `/api/v1/workspaces/${ws}/documents/by-path?path=${encodeURIComponent(DOC)}`,
      )
      .set(bearer(ownerToken))
      .expect(404);

    // watcher notified with kind 'deleted'
    const list = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/notifications`)
      .set(bearer(memberToken))
      .expect(200);
    const del = list.body.find((n: { kind: string }) => n.kind === 'deleted');
    expect(del).toMatchObject({
      kind: 'deleted',
      filePath: DOC,
      actor: 'Owner',
    });

    // audit trail
    const audit = await request(http())
      .get(`/api/v1/workspaces/${ws}/audit`)
      .set(bearer(ownerToken))
      .expect(200);
    expect(
      audit.body.some(
        (e: { action: string }) => e.action === 'document.deleted',
      ),
    ).toBe(true);
  });

  it('returns 404 when deleting a missing document', async () => {
    await request(http())
      .delete(
        `/api/v1/workspaces/${ws}/documents?path=${encodeURIComponent('no/such.md')}`,
      )
      .set(bearer(ownerToken))
      .expect(404);
  });
});
