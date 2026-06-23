import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { createHmac } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import {
  Membership,
  MembershipDocument,
} from '../src/workspaces/schemas/membership.schema';
import { Role } from '../src/common/enums/role.enum';
import { internalWorkspaceId, internalUserId } from './uuid-helper';

// --- Pomocniki do podrabiania tokenów JWT ---
function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function signHS256(payload: object, secret: string): string {
  const data = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}
function noneAlgToken(payload: object): string {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`;
}

describe('Security / penetration (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let membershipModel: Model<MembershipDocument>;

  const server = () => app.getHttpServer();

  // ofiara (workspace A) i napastnik (workspace B)
  let victimToken: string;
  let victimWs: string;
  let attackerToken: string;
  let viewerToken: string;
  let ciToken: string;

  async function register(email: string, name: string): Promise<string> {
    const res = await request(server())
      .post('/api/v1/auth/register')
      .send({ email, name, password: 'password123' })
      .expect(201);
    return res.body.accessToken as string;
  }
  async function firstWorkspace(token: string): Promise<string> {
    const me = await request(server())
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
    await connection.dropDatabase();

    victimToken = await register('victim@example.com', 'Victim');
    victimWs = await firstWorkspace(victimToken);
    attackerToken = await register('attacker@example.com', 'Attacker');

    // viewer dosadzony do workspace ofiary
    viewerToken = await register('viewer@example.com', 'Viewer');
    const viewerMe = await request(server())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    await membershipModel.create({
      workspaceId: await internalWorkspaceId(app, victimWs),
      userId: await internalUserId(app, viewerMe.body.user.id),
      role: Role.Viewer,
    });

    // token CI ofiary + seedowy dokument
    const key = await request(server())
      .post(`/api/v1/workspaces/${victimWs}/api-keys`)
      .set('Authorization', `Bearer ${victimToken}`)
      .send({ name: 'CI' })
      .expect(201);
    ciToken = key.body.token;
    await request(server())
      .post(`/api/v1/workspaces/${victimWs}/documents`)
      .set('Authorization', `Bearer ${victimToken}`)
      .send({ file_path: 'secret.md', content_raw: '# Secret\n' })
      .expect(201);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  describe('NoSQL injection', () => {
    it('login z operatorem zamiast e-maila → 400 (nie bypass)', async () => {
      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: { $ne: null }, password: { $ne: null } })
        .expect(400);
    });

    it('by-path z operatorem w query (?path[$ne]=) nie wycieka dokumentu', async () => {
      const res = await request(server())
        .get(`/api/v1/workspaces/${victimWs}/documents/by-path`)
        .query({ 'path[$ne]': '' })
        .set('Authorization', `Bearer ${victimToken}`);
      // Kluczowe: brak wycieku — odrzucone (400) lub nietrafione (404),
      // nigdy 200 z treścią dokumentu.
      expect([400, 404]).toContain(res.status);
      expect(res.body.contentHtml).toBeUndefined();
    });
  });

  describe('Mass assignment', () => {
    it('rejestracja z dodatkowymi polami (role/isAdmin) → 400', async () => {
      await request(server())
        .post('/api/v1/auth/register')
        .send({
          email: 'evil@example.com',
          name: 'Evil',
          password: 'password123',
          role: 'owner',
          isAdmin: true,
        })
        .expect(400);
    });
  });

  describe('JWT tampering', () => {
    it('brak tokena → 401', async () => {
      await request(server()).get('/api/v1/auth/me').expect(401);
    });
    it('śmieciowy token → 401', async () => {
      await request(server())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);
    });
    it('token alg:none → 401', async () => {
      const t = noneAlgToken({ sub: '6a000000000000000000000a' });
      await request(server())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${t}`)
        .expect(401);
    });
    it('token podpisany złym sekretem → 401', async () => {
      const t = signHS256({ sub: '6a000000000000000000000a' }, 'wrong-secret');
      await request(server())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${t}`)
        .expect(401);
    });
  });

  describe('BOLA / izolacja tenantów (cross-tenant)', () => {
    it('napastnik nie listuje członków cudzego workspace → 403', async () => {
      await request(server())
        .get(`/api/v1/workspaces/${victimWs}/members`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .expect(403);
    });
    it('napastnik nie czyta cudzego dokumentu → 403', async () => {
      await request(server())
        .get(`/api/v1/workspaces/${victimWs}/documents/by-path`)
        .query({ path: 'secret.md' })
        .set('Authorization', `Bearer ${attackerToken}`)
        .expect(403);
    });
    it('napastnik nie zapisuje do cudzego workspace → 403', async () => {
      await request(server())
        .post(`/api/v1/workspaces/${victimWs}/documents`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({ file_path: 'pwn.md', content_raw: 'x' })
        .expect(403);
    });
    it('token CI nie działa na inny workspace → 403', async () => {
      const attackerWs = await firstWorkspace(attackerToken);
      await request(server())
        .post(`/api/v1/workspaces/${attackerWs}/documents`)
        .set('Authorization', `Bearer ${ciToken}`)
        .send({ file_path: 'x.md', content_raw: 'x' })
        .expect(403);
    });
  });

  describe('Eskalacja uprawnień (viewer)', () => {
    it('viewer nie zmienia ról → 403', async () => {
      const viewerMe = await request(server())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${viewerToken}`);
      await request(server())
        .patch(
          `/api/v1/workspaces/${victimWs}/members/${viewerMe.body.user.id}`,
        )
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ role: 'owner' })
        .expect(403);
    });
    it('viewer nie tworzy tokenów CI → 403', async () => {
      await request(server())
        .post(`/api/v1/workspaces/${victimWs}/api-keys`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'x' })
        .expect(403);
    });
    it('viewer nie zapisuje dokumentów → 403', async () => {
      await request(server())
        .post(`/api/v1/workspaces/${victimWs}/documents`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ file_path: 'x.md', content_raw: 'x' })
        .expect(403);
    });
  });

  describe('Ekspozycja wrażliwych danych', () => {
    it('odpowiedzi auth nie zawierają passwordHash', async () => {
      const reg = await request(server())
        .post('/api/v1/auth/register')
        .send({
          email: 'leak@example.com',
          name: 'Leak',
          password: 'password123',
        })
        .expect(201);
      expect(JSON.stringify(reg.body)).not.toContain('passwordHash');

      const me = await request(server())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${reg.body.accessToken}`)
        .expect(200);
      expect(JSON.stringify(me.body)).not.toContain('passwordHash');
    });
    it('lista tokenów CI nie ujawnia hasha ani surowca', async () => {
      const res = await request(server())
        .get(`/api/v1/workspaces/${victimWs}/api-keys`)
        .set('Authorization', `Bearer ${victimToken}`)
        .expect(200);
      const dump = JSON.stringify(res.body);
      expect(dump).not.toContain('keyHash');
      expect(dump).not.toMatch(/"token"/);
    });
    it('lista zaproszeń nie ujawnia tokenHash', async () => {
      await request(server())
        .post(`/api/v1/workspaces/${victimWs}/invitations`)
        .set('Authorization', `Bearer ${victimToken}`)
        .send({ email: 'inv@example.com', role: 'editor' })
        .expect(201);
      const res = await request(server())
        .get(`/api/v1/workspaces/${victimWs}/invitations`)
        .set('Authorization', `Bearer ${victimToken}`)
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain('tokenHash');
    });
  });

  describe('Path traversal', () => {
    it.each(['../../etc/passwd.md', 'a/../../b.md', '/etc/passwd.md'])(
      'odrzuca ścieżkę %s → 400',
      async (file_path) => {
        await request(server())
          .post(`/api/v1/workspaces/${victimWs}/documents`)
          .set('Authorization', `Bearer ${victimToken}`)
          .send({ file_path, content_raw: 'x' })
          .expect(400);
      },
    );
  });

  describe('XSS w Markdown', () => {
    it('skrypt i javascript: link są neutralizowane w content_html', async () => {
      const content =
        '# T\n\n<script>alert(1)</script>\n\n[c](javascript:alert(1))\n';
      await request(server())
        .post(`/api/v1/workspaces/${victimWs}/documents`)
        .set('Authorization', `Bearer ${victimToken}`)
        .send({ file_path: 'xss.md', content_raw: content })
        .expect(201);

      const res = await request(server())
        .get(`/api/v1/workspaces/${victimWs}/documents/by-path`)
        .query({ path: 'xss.md' })
        .set('Authorization', `Bearer ${victimToken}`)
        .expect(200);

      expect(res.body.contentHtml).not.toContain('<script>');
      expect(res.body.contentHtml).not.toMatch(/href="javascript:/i);
    });
  });
});
