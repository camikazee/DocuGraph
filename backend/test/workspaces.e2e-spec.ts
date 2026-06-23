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

interface Registered {
  token: string;
  userId: string;
  workspaceId: string;
}

describe('Workspaces RBAC & isolation (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let membershipModel: Model<MembershipDocument>;

  let ada: Registered; // owner workspace A
  let bob: Registered; // dosadzony jako viewer do A
  let carol: Registered; // obca osoba

  async function register(email: string, name: string): Promise<Registered> {
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, name, password: 'password123' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return {
      token,
      userId: reg.body.user.id as string,
      workspaceId: me.body.workspaces[0].id as string,
    };
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

    ada = await register('ada@example.com', 'Ada');
    bob = await register('bob@example.com', 'Bob');
    carol = await register('carol@example.com', 'Carol');

    // Dosadzamy Boba do workspace Ady jako viewer (brak jeszcze zaproszeń).
    await membershipModel.create({
      workspaceId: await internalWorkspaceId(app, ada.workspaceId),
      userId: await internalUserId(app, bob.userId),
      role: Role.Viewer,
    });
  });

  afterAll(async () => {
    if (connection) {
      await connection.dropDatabase();
    }
    await app?.close();
  });

  it('POST /workspaces tworzy nowy workspace', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ada.token}`)
      .send({ name: 'Docs Team' })
      .expect(201);
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.slug).toContain('docs-team');
  });

  it('członek (viewer) może listować członków', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ada.workspaceId}/members`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);
    expect(res.body).toHaveLength(2); // Ada (owner) + Bob (viewer)
  });

  it('izolacja: obca osoba nie ma dostępu do workspace → 403', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ada.workspaceId}/members`)
      .set('Authorization', `Bearer ${carol.token}`)
      .expect(403);
  });

  it('viewer nie może zmieniać ról → 403', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${ada.workspaceId}/members/${bob.userId}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ role: 'editor' })
      .expect(403);
  });

  it('owner może zmienić rolę członka → 204', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${ada.workspaceId}/members/${bob.userId}`)
      .set('Authorization', `Bearer ${ada.token}`)
      .send({ role: 'editor' })
      .expect(204);
  });

  it('nie można zdegradować ostatniego właściciela → 400', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${ada.workspaceId}/members/${ada.userId}`)
      .set('Authorization', `Bearer ${ada.token}`)
      .send({ role: 'viewer' })
      .expect(400);
  });

  it('owner może usunąć członka → 204', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${ada.workspaceId}/members/${bob.userId}`)
      .set('Authorization', `Bearer ${ada.token}`)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ada.workspaceId}/members`)
      .set('Authorization', `Bearer ${ada.token}`)
      .expect(200);
    expect(res.body).toHaveLength(1);
  });

  it('odrzuca niepoprawny identyfikator workspace → 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/workspaces/not-an-objectid/members')
      .set('Authorization', `Bearer ${ada.token}`)
      .expect(400);
  });
});
