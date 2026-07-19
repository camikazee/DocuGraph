import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import JSZip from 'jszip';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Raw Markdown source: export + ZIP import (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let token: string;
  let ws: string;
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
      .send({ email: 'io@example.com', name: 'IO', password: 'password123' })
      .expect(201);
    token = reg.body.accessToken;
    ws = (
      await request(http()).get('/api/v1/auth/me').set('Authorization', auth())
    ).body.workspaces[0].id;
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', auth())
      .send({ file_path: 'docs/a.md', content_raw: '# A\n\nhello' })
      .expect(201);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('exports raw .md preserving paths', async () => {
    const res = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents/export/source.zip`)
      .set('Authorization', auth())
      .responseType('blob')
      .expect(200);
    expect(res.headers['content-type']).toContain('application/zip');
    const zip = await JSZip.loadAsync(res.body as Buffer);
    expect(zip.file('docs/a.md')).toBeTruthy();
    expect(await zip.file('docs/a.md')!.async('string')).toContain('hello');
  });

  it('imports a .md tree from a ZIP, ignoring non-markdown', async () => {
    const zip = new JSZip();
    zip.file('guide/intro.md', '# Intro');
    zip.file('guide/sub/deep.md', '# Deep');
    zip.file('readme.txt', 'not markdown'); // non-md → ignored (not counted)
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const res = await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/import.zip`)
      .set('Authorization', auth())
      .attach('file', buffer, {
        filename: 'import.zip',
        contentType: 'application/zip',
      })
      .expect(201);
    expect(res.body.imported).toBe(2);

    const list = await request(http())
      .get(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', auth())
      .expect(200);
    const paths = list.body.map((d: { filePath: string }) => d.filePath);
    expect(paths).toEqual(
      expect.arrayContaining(['guide/intro.md', 'guide/sub/deep.md']),
    );
    expect(paths).not.toContain('readme.txt');
  });

  it('rejects an invalid ZIP', async () => {
    await request(http())
      .post(`/api/v1/workspaces/${ws}/documents/import.zip`)
      .set('Authorization', auth())
      .attach('file', Buffer.from('not a zip'), {
        filename: 'x.zip',
        contentType: 'application/zip',
      })
      .expect(400);
  });
});
