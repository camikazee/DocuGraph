import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { createHmac } from 'crypto';
import { json } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('GitHub webhooks (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let ownerToken: string;
  let workspaceId: string; // public uuid
  let secret: string;

  const PAYLOAD = JSON.stringify({ ref: 'refs/heads/main', commits: [] });
  const sign = (body: string, key: string) =>
    'sha256=' + createHmac('sha256', key).update(body).digest('hex');

  async function register(email: string, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, name, password: 'password123' })
      .expect(201);
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Zachowaj surowy bufor — tak jak w main.ts (potrzebny do weryfikacji HMAC).
    app.use(
      json({
        verify: (
          req: IncomingMessage & { rawBody?: Buffer },
          _res: ServerResponse,
          buf: Buffer,
        ) => {
          req.rawBody = buf;
        },
      }),
    );
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

    ownerToken = await register('owner@example.com', 'Owner');
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    workspaceId = me.body.workspaces[0].id as string;

    // Włącz webhooki — generuje sekret HMAC.
    await request(app.getHttpServer())
      .put(`/api/v1/workspaces/${workspaceId}/documents/source`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ provider: 'github', repo: 'octocat/missing', realtimeWebhooks: true })
      .expect(200);

    const cfg = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/documents/source/webhook`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    secret = cfg.body.secret as string;
    expect(cfg.body.enabled).toBe(true);
    expect(secret).toMatch(/^[0-9a-f]{48}$/);
    expect(cfg.body.path).toBe(`/workspaces/${workspaceId}/hooks/github`);
  });

  afterAll(async () => {
    await app.close();
  });

  it('hides the webhook secret from the general source endpoint', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/documents/source`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.realtimeWebhooks).toBe(true);
    expect(res.body.webhookSecret).toBeUndefined();
  });

  it('rejects a delivery with no signature (400)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/hooks/github`)
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .send(PAYLOAD)
      .expect(400);
  });

  it('rejects a delivery with a bad signature (401)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/hooks/github`)
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', sign(PAYLOAD, 'wrong-secret'))
      .send(PAYLOAD)
      .expect(401);
  });

  it('rejects a delivery signed for the wrong body (401)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/hooks/github`)
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', sign('{"ref":"tampered"}', secret))
      .send(PAYLOAD)
      .expect(401);
  });

  it('answers a signed ping with pong', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/hooks/github`)
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'ping')
      .set('x-hub-signature-256', sign(PAYLOAD, secret))
      .send(PAYLOAD)
      .expect(200);
    expect(res.body).toEqual({ ok: true, pong: true });
  });

  it('accepts a signed push and dispatches a reindex (200)', async () => {
    // Repo nie istnieje → reindex zawodzi, ale dostawa jest potwierdzona,
    // co dowodzi, że poprawna sygnatura uruchamia ścieżkę reindeksu.
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/hooks/github`)
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', sign(PAYLOAD, secret))
      .send(PAYLOAD)
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.reindexed).toBe(false);
    expect(typeof res.body.error).toBe('string');
  });

  it('ignores unknown event types with a signed body', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/hooks/github`)
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'issues')
      .set('x-hub-signature-256', sign(PAYLOAD, secret))
      .send(PAYLOAD)
      .expect(200);
    expect(res.body).toEqual({ ok: true, ignored: 'issues' });
  });

  it('404s for a workspace without webhooks enabled', async () => {
    const otherToken = await register('other@example.com', 'Other');
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    const otherWs = me.body.workspaces[0].id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${otherWs}/hooks/github`)
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', sign(PAYLOAD, secret))
      .send(PAYLOAD)
      .expect(404);
  });
});
