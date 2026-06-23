import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import {
  Membership,
  MembershipDocument,
} from '../src/workspaces/schemas/membership.schema';
import { Role } from '../src/common/enums/role.enum';
import { internalWorkspaceId, internalUserId } from './uuid-helper';

describe('API keys / CI tokens (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let membershipModel: Model<MembershipDocument>;

  let ownerToken: string;
  let workspaceId: string;

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
    membershipModel = app.get<Model<MembershipDocument>>(
      getModelToken(Membership.name),
    );
    await connection.dropDatabase();

    ownerToken = await register('owner@example.com', 'Owner');
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    workspaceId = me.body.workspaces[0].id as string;
  });

  afterAll(async () => {
    if (connection) {
      await connection.dropDatabase();
    }
    await app?.close();
  });

  function createKey(name = 'Jenkins CI') {
    return request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/api-keys`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name });
  }

  it('owner tworzy token (dg_live_) z maską i surowcem raz', async () => {
    const res = await createKey().expect(201);
    expect(res.body.token).toMatch(/^dg_live_[0-9a-f]+$/);
    expect(res.body.keyPrefix).toMatch(/^dg_live_••••/);
    expect(res.body).not.toHaveProperty('keyHash');
  });

  it('token CI uwierzytelnia /ci/whoami i zwraca właściwy workspace', async () => {
    const created = await createKey('Deploy bot').expect(201);
    const res = await request(app.getHttpServer())
      .get('/api/v1/ci/whoami')
      .set('Authorization', `Bearer ${created.body.token as string}`)
      .expect(200);
    expect(res.body.workspaceId).toBe(workspaceId);
    expect(res.body.auth).toBe('apiKey');
  });

  it('lista tokenów jest maskowana (bez surowca i hasha)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/api-keys`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    for (const k of res.body) {
      expect(k.keyPrefix).toMatch(/^dg_live_••••/);
      expect(k).not.toHaveProperty('token');
      expect(k).not.toHaveProperty('keyHash');
    }
  });

  it('odwołany token → 401 na /ci/whoami', async () => {
    const created = await createKey('To revoke').expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceId}/api-keys/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/v1/ci/whoami')
      .set('Authorization', `Bearer ${created.body.token as string}`)
      .expect(401);
  });

  it('nieprawidłowy token → 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/ci/whoami')
      .set('Authorization', 'Bearer dg_live_deadbeef')
      .expect(401);
  });

  it('viewer nie może tworzyć tokenów → 403', async () => {
    const viewerToken = await register('viewer@example.com', 'Viewer');
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    await membershipModel.create({
      workspaceId: await internalWorkspaceId(app, workspaceId),
      userId: await internalUserId(app, me.body.user.id as string),
      role: Role.Viewer,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/api-keys`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'nope' })
      .expect(403);
  });
});
