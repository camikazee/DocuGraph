import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ErrorLogService } from '../src/error-log/error-log.service';

describe('Local error log (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let ws: string;
  let owner: string;
  let member: string;

  const http = () => app.getHttpServer();
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

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
    // Wire the local error log into the filter, as main.ts does in production.
    app.useGlobalFilters(new AllExceptionsFilter(app.get(ErrorLogService)));
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    await connection.dropDatabase();

    owner = await register('owner@err.test', 'Owner');
    ws = (await request(http()).get('/api/v1/auth/me').set(bearer(owner))).body
      .workspaces[0].id;
    member = await register('member@err.test', 'Member');
    const inv = await request(http())
      .post(`/api/v1/workspaces/${ws}/invitations`)
      .set(bearer(owner))
      .send({ email: 'member@err.test', role: 'editor' })
      .expect(201);
    await request(http())
      .post('/api/v1/invitations/accept')
      .set(bearer(member))
      .send({ token: inv.body.token })
      .expect(201);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('records a client-reported error and lists it for the owner (no stack)', async () => {
    await request(http())
      .post(`/api/v1/workspaces/${ws}/client-errors`)
      .set(bearer(member))
      .send({
        message: 'TypeError: cannot read x of undefined',
        stack: 'at Foo (app.js:1:1)',
        url: '/documents/view',
      })
      .expect(204);

    const res = await request(http())
      .get(`/api/v1/workspaces/${ws}/errors`)
      .set(bearer(owner))
      .expect(200);

    const item = res.body.find((e: { message: string }) =>
      e.message.startsWith('TypeError'),
    );
    expect(item).toBeTruthy();
    expect(item.source).toBe('client');
    expect(item.user).toBe('Member');
    // stack is kept locally, never exposed via the API
    expect(JSON.stringify(res.body)).not.toContain('app.js');
  });

  it('a non-owner cannot read the error log (403)', async () => {
    await request(http())
      .get(`/api/v1/workspaces/${ws}/errors`)
      .set(bearer(member))
      .expect(403);
  });

  it('validates the client-error payload (400 on empty message)', async () => {
    await request(http())
      .post(`/api/v1/workspaces/${ws}/client-errors`)
      .set(bearer(member))
      .send({ message: '' })
      .expect(400);
  });

  it('record() is best-effort and tolerates a 5xx shape without a workspace', async () => {
    const svc = app.get(ErrorLogService);
    await expect(
      svc.record({
        source: 'server',
        message: 'Boom 500',
        stack: 'secret stack',
        method: 'GET',
        path: '/api/v1/boom',
        statusCode: 500,
      }),
    ).resolves.toBeUndefined();
  });
});
