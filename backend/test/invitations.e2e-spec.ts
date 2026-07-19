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
import { MailerService } from '../src/common/mailer/mailer.service';
import { internalWorkspaceId, internalUserId } from './uuid-helper';

describe('Invitations (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let membershipModel: Model<MembershipDocument>;
  let mailer: MailerService;

  let ownerToken: string;
  let workspaceId: string;

  async function register(email: string, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, name, password: 'password123' })
      .expect(201);
    return res.body.accessToken as string;
  }

  async function workspaceOf(token: string): Promise<string> {
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return me.body.workspaces[0].id as string;
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
    mailer = app.get<MailerService>(MailerService);
    await connection.dropDatabase();

    ownerToken = await register('owner@example.com', 'Owner');
    workspaceId = await workspaceOf(ownerToken);
  });

  afterAll(async () => {
    if (connection) {
      await connection.dropDatabase();
    }
    await app?.close();
  });

  function invite(token: string, email: string, role = 'editor') {
    return request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email, role });
  }

  it('owner zaprasza członka i dostaje token', async () => {
    const res = await invite(ownerToken, 'invitee@example.com').expect(201);
    expect(res.body.email).toBe('invitee@example.com');
    expect(res.body.role).toBe('editor');
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('wysyła zaproszony mail z linkiem akceptującym', async () => {
    mailer.lastSent = null;
    await invite(ownerToken, 'mailed@example.com').expect(201);
    const sent = mailer.lastSent as {
      to: string;
      subject: string;
      link?: string;
    } | null;
    expect(sent?.to).toBe('mailed@example.com');
    expect(sent?.subject).toContain('invited you');
    expect(sent?.link).toContain('/invite?token=');
  });

  it('lista oczekujących zaproszeń', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('zaproszony rejestruje się i akceptuje → dołącza do workspace', async () => {
    const inv = await invite(ownerToken, 'newbie@example.com').expect(201);
    const token = inv.body.token as string;

    const newbieToken = await register('newbie@example.com', 'Newbie');
    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${newbieToken}`)
      .send({ token })
      .expect(201);

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${newbieToken}`)
      .expect(200);
    // Własny workspace + ten, do którego dołączył.
    expect(me.body.workspaces).toHaveLength(2);
  });

  it('akceptacja przez niewłaściwy e-mail → 403', async () => {
    const inv = await invite(ownerToken, 'target@example.com').expect(201);
    const other = await register('other@example.com', 'Other');
    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${other}`)
      .send({ token: inv.body.token })
      .expect(403);
  });

  it('odwołane zaproszenie → 410 przy akceptacji', async () => {
    const inv = await invite(ownerToken, 'revoked@example.com').expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceId}/invitations/${inv.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const revokedUser = await register('revoked@example.com', 'Revoked');
    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${revokedUser}`)
      .send({ token: inv.body.token })
      .expect(410);
  });

  it('nieprawidłowy token → 404', async () => {
    const someUser = await register('nobody@example.com', 'Nobody');
    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${someUser}`)
      .send({ token: 'deadbeef'.repeat(8) })
      .expect(404);
  });

  it('viewer nie może zapraszać → 403', async () => {
    const viewerToken = await register('viewer@example.com', 'Viewer');
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    const viewerUserId = me.body.user.id as string;

    await membershipModel.create({
      workspaceId: await internalWorkspaceId(app, workspaceId),
      userId: await internalUserId(app, viewerUserId),
      role: Role.Viewer,
    });

    await invite(viewerToken, 'whoever@example.com').expect(403);
  });
});
