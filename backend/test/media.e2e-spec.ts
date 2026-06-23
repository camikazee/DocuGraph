import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Media & volumes (e2e)', () => {
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
        email: 'owner@example.com',
        name: 'Owner',
        password: 'password123',
      })
      .expect(201);
    token = reg.body.accessToken as string;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', auth())
      .expect(200);
    ws = me.body.workspaces[0].id as string;
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  let assetId: string;

  it('default local volume exists', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/volumes`)
      .set('Authorization', auth())
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].provider).toBe('local');
    expect(res.body[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('uploads an image to the local volume and serves it back', async () => {
    const up = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/assets`)
      .set('Authorization', auth())
      .attach('file', PNG, { filename: 'pixel.png', contentType: 'image/png' })
      .expect(201);
    expect(up.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(up.body.type).toBe('image');
    expect(up.body.width).toBe(1);
    assetId = up.body.id;

    const served = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/assets/${assetId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(served.headers['content-type']).toContain('image/png');
    expect(Buffer.from(served.body).equals(PNG)).toBe(true);
  });

  it('serves the asset publicly via capability URL (no auth header)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/public/workspaces/${ws}/assets/${assetId}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(Buffer.from(res.body).equals(PNG)).toBe(true);
  });

  it('tracks references and broken/unused in overview', async () => {
    // unused initially
    let ov = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/assets/overview`)
      .set('Authorization', auth())
      .expect(200);
    expect(ov.body.counts.unused).toBe(1);
    expect(ov.body.usedBytes).toBeGreaterThan(0);

    // reference the asset from a document + a broken ref
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', auth())
      .send({
        file_path: 'uses-media.md',
        content_raw: `# Uses\n\n![pixel](/api/v1/workspaces/${ws}/assets/${assetId})\n\n![missing](/api/v1/workspaces/${ws}/assets/00000000-0000-4000-8000-000000000000)`,
      })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/assets`)
      .set('Authorization', auth())
      .expect(200);
    expect(list.body[0].referencedIn).toContain('uses-media.md');

    ov = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/assets/overview`)
      .set('Authorization', auth())
      .expect(200);
    expect(ov.body.counts.unused).toBe(0);
    expect(ov.body.brokenLinks).toBe(1);
  });

  it('renames then deletes the asset', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${ws}/assets/${assetId}`)
      .set('Authorization', auth())
      .send({ name: 'renamed.png' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${ws}/assets/${assetId}`)
      .set('Authorization', auth())
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/assets/${assetId}`)
      .set('Authorization', auth())
      .expect(404);
  });

  it('rejects unsupported file types', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/assets`)
      .set('Authorization', auth())
      .attach('file', Buffer.from('hello'), {
        filename: 'a.exe',
        contentType: 'application/x-msdownload',
      })
      .expect(400);
  });

  it('FTP test connection to a closed port reports unreachable', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/volumes/test`)
      .set('Authorization', auth())
      .send({ provider: 'ftp', config: { host: '127.0.0.1', port: 1 } })
      .expect(201);
    expect(res.body.ok).toBe(false);
  });

  it('mounts an S3 volume, masks the secret, and reports an unreachable test', async () => {
    const vol = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/volumes`)
      .set('Authorization', auth())
      .send({
        name: 'Cloud',
        provider: 's3',
        config: {
          bucket: 'demo-bucket',
          region: 'us-east-1',
          endpoint: 'http://127.0.0.1:9 ',
          accessKeyId: 'AK',
          secretAccessKey: 'SK',
        },
      })
      .expect(201);
    expect(vol.body.id).toMatch(/^[0-9a-f-]{36}$/);
    // secret never returned in cleartext
    expect(vol.body.config.secretAccessKey).toBe('••••••••');

    // unreachable endpoint → test reports not-ok (no live S3 in CI)
    const test = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/volumes/${vol.body.id}/test`)
      .set('Authorization', auth())
      .expect(201);
    expect(test.body.ok).toBe(false);
  });
});
