import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import JSZip from 'jszip';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Multi-page ZIP export (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let token: string;
  let ws: string;
  let wsName: string;
  const http = () => app.getHttpServer();
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

    const reg = await request(http())
      .post('/api/v1/auth/register')
      .send({ email: 'zip@example.com', name: 'Zip', password: 'password123' })
      .expect(201);
    token = reg.body.accessToken;
    const me = (
      await request(http()).get('/api/v1/auth/me').set('Authorization', auth())
    ).body.workspaces[0];
    ws = me.id;
    wsName = me.name;

    const create = (file_path: string, content_raw: string) =>
      request(http())
        .post(`/api/v1/workspaces/${ws}/documents`)
        .set('Authorization', auth())
        .send({ file_path, content_raw })
        .expect(201);
    await create('README.md', '# Readme\n\nSee [overview](api/overview.md).');
    await create('api/overview.md', '# Overview\n\nSee [auth](auth.md).');
    await create('api/auth.md', '# Auth\n');
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('returns a zip with per-page HTML, shared css, index, and rewritten links', async () => {
    const res = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/export.zip`)
      .set('Authorization', auth())
      .responseType('blob')
      .expect(200);
    expect(res.headers['content-type']).toContain('application/zip');

    const zip = await JSZip.loadAsync(res.body as Buffer);
    expect(zip.file('style.css')).toBeTruthy();
    expect(zip.file('index.html')).toBeTruthy();
    expect(zip.file('README.html')).toBeTruthy();
    expect(zip.file('api/overview.html')).toBeTruthy();
    expect(zip.file('api/auth.html')).toBeTruthy();

    // sibling link api/overview.md -> api/auth.md becomes relative auth.html
    const overview = await zip.file('api/overview.html')!.async('string');
    expect(overview).toContain('href="auth.html"');
    // css referenced relative to page depth
    expect(overview).toContain('href="../style.css"');

    // README links down into api/overview.html
    const readme = await zip.file('README.html')!.async('string');
    expect(readme).toContain('href="api/overview.html"');
    expect(readme).toContain('href="style.css"');

    // export is branded with the workspace name
    const index = await zip.file('index.html')!.async('string');
    expect(wsName).toBeTruthy();
    expect(index).toContain(wsName);
  });

  it('embeds referenced images as data URIs (self-contained)', async () => {
    const PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const up = await request(http())
      .post(`/api/v1/workspaces/${ws}/assets`)
      .set('Authorization', auth())
      .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' })
      .expect(201);
    const assetId = up.body.id as string;

    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', auth())
      .send({
        file_path: 'img.md',
        content_raw: `# Img\n\n![logo](http://api/public/workspaces/${ws}/assets/${assetId})`,
      })
      .expect(201);

    const res = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/export.zip`)
      .set('Authorization', auth())
      .responseType('blob')
      .expect(200);
    const zip = await JSZip.loadAsync(res.body as Buffer);
    const html = await zip.file('img.html')!.async('string');
    expect(html).toContain('data:image/png;base64,');
    expect(html).not.toContain(`/assets/${assetId}`);
  });
});
