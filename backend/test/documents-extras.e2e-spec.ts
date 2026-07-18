import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Document extras: tags + feed (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let token: string;
  let ws: string;

  const auth = () => `Bearer ${token}`;

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

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'extras@example.com',
        name: 'Extras',
        password: 'password123',
      })
      .expect(201);
    token = reg.body.accessToken as string;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', auth())
      .expect(200);
    ws = me.body.workspaces[0].id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', auth())
      .send({
        file_path: 'api/auth.md',
        content_raw:
          '---\ntitle: Authentication\ntags: [api, security]\n---\n\n# Authentication\n',
      })
      .expect(201);
    // a doc with a broken outgoing link (for per-document health)
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', auth())
      .send({
        file_path: 'notes/draft.md',
        content_raw: '# Draft\n\nSee [missing](nope.md).',
      })
      .expect(201);
    // a doc that links to an existing doc (for export anchor rewriting)
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', auth())
      .send({
        file_path: 'index.md',
        content_raw: '# Index\n\nGo to [draft](notes/draft.md).',
      })
      .expect(201);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('document list includes frontmatter tags', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', auth())
      .expect(200);
    const doc = res.body.find(
      (d: { filePath: string }) => d.filePath === 'api/auth.md',
    );
    expect(doc.tags).toEqual(expect.arrayContaining(['api', 'security']));
  });

  it('document list includes per-document health flags', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', auth())
      .expect(200);
    const auth_ = res.body.find(
      (d: { filePath: string }) => d.filePath === 'api/auth.md',
    );
    const draft = res.body.find(
      (d: { filePath: string }) => d.filePath === 'notes/draft.md',
    );
    // api/auth.md links nowhere and nothing links to it → orphan
    expect(auth_.health).toMatchObject({ broken: false, orphan: true });
    // notes/draft.md links to a missing file → broken
    expect(draft.health.broken).toBe(true);
  });

  it('exports a self-contained HTML file with internal links rewritten to anchors', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/documents/export.html`)
      .set('Authorization', auth())
      .expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    // every doc becomes a section anchor + appears in the nav
    expect(res.text).toContain('id="doc-api-auth-md"');
    expect(res.text).toContain('id="doc-index-md"');
    expect(res.text).toContain('>Authentication<');
    // index.md's link to notes/draft.md is rewritten to the in-page anchor
    expect(res.text).toContain('href="#doc-notes-draft-md"');
    // broken link (notes/draft.md -> nope.md) is left untouched
    expect(res.text).toContain('href="nope.md"');
  });

  it('serves a valid Atom feed of recently updated docs', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/documents/feed.atom`)
      .set('Authorization', auth())
      .expect(200);
    expect(res.headers['content-type']).toContain('application/atom+xml');
    expect(res.text).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(res.text).toContain('<title>Authentication</title>');
    expect(res.text).toContain('/documents/view?path=api%2Fauth.md');
  });
});
