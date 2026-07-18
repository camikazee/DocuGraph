import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { MailerService } from '../src/common/mailer/mailer.service';
import { DocumentsService } from '../src/documents/documents.service';

describe('Email notifications for watched documents (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let mailer: MailerService;
  let ownerToken: string;
  let memberToken: string;
  let ws: string;
  const DOC = 'guide/email.md';
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
    mailer = app.get<MailerService>(MailerService);
    await connection.dropDatabase();

    const owner = await request(http())
      .post('/api/v1/auth/register')
      .send({
        email: 'owner@mail.test',
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
        email: 'member@mail.test',
        name: 'Member',
        password: 'password123',
      })
      .expect(201);
    memberToken = member.body.accessToken;
    const inv = await request(http())
      .post(`/api/v1/workspaces/${ws}/invitations`)
      .set(bearer(ownerToken))
      .send({ email: 'member@mail.test', role: 'editor' })
      .expect(201);
    await request(http())
      .post('/api/v1/invitations/accept')
      .set(bearer(memberToken))
      .send({ token: inv.body.token })
      .expect(201);

    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set(bearer(ownerToken))
      .send({ file_path: DOC, content_raw: '# Email\n\nv1' })
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

  const editDoc = (body: string) =>
    request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set(bearer(ownerToken))
      .send({ file_path: DOC, content_raw: body })
      .expect(201);

  it('does not email a watcher who has not opted in', async () => {
    mailer.lastSent = null;
    await editDoc('# Email\n\nv2');
    expect(mailer.lastSent).toBeNull();
  });

  it('emails a watcher who opted in when the document changes', async () => {
    await request(http())
      .patch('/api/v1/notification-preferences')
      .set(bearer(memberToken))
      .send({ emailEnabled: true })
      .expect(200);

    mailer.lastSent = null;
    await editDoc('# Email\n\nv3 — should email the member');

    const sent = mailer.lastSent as { to: string; subject: string } | null;
    expect(sent).not.toBeNull();
    expect(sent?.to).toBe('member@mail.test');
    expect(sent?.subject).toContain('Owner');
  });

  it('reflects the preference via GET', async () => {
    const res = await request(http())
      .get('/api/v1/notification-preferences')
      .set(bearer(memberToken))
      .expect(200);
    expect(res.body.emailEnabled).toBe(true);
  });

  it('stops emailing after opting out', async () => {
    await request(http())
      .patch('/api/v1/notification-preferences')
      .set(bearer(memberToken))
      .send({ emailEnabled: false })
      .expect(200);

    mailer.lastSent = null;
    await editDoc('# Email\n\nv4 — no email now');
    expect(mailer.lastSent).toBeNull();
  });

  it('sends a daily digest to users who enabled it', async () => {
    const documents = app.get<DocumentsService>(DocumentsService);
    // digest on, instant off — so only the digest path can send mail
    await request(http())
      .patch('/api/v1/notification-preferences')
      .set(bearer(memberToken))
      .send({ digestEnabled: true, emailEnabled: false })
      .expect(200);
    // make sure the member has at least one unread notification
    await editDoc('# Email\n\nv5 — accumulates for the digest');

    mailer.lastSent = null;
    const sent = await documents.sendDailyDigests();
    expect(sent).toBeGreaterThanOrEqual(1);

    const digest = mailer.lastSent as { to: string; subject: string } | null;
    expect(digest?.to).toBe('member@mail.test');
    expect(digest?.subject.toLowerCase()).toContain('digest');
  });
});
