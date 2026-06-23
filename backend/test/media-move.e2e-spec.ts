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

describe('Move asset between volumes (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let token: string;
  let ws: string;
  let volA: string; // default local volume
  let volB: string; // second local volume
  let assetId: string;

  const auth = () => `Bearer ${token}`;
  const volumes = () =>
    request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/volumes`)
      .set('Authorization', auth());

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
      .send({ email: 'mover@example.com', name: 'Mover', password: 'password123' })
      .expect(201);
    token = reg.body.accessToken as string;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', auth())
      .expect(200);
    ws = me.body.workspaces[0].id as string;

    // upload seeds the default local volume
    const up = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/assets`)
      .set('Authorization', auth())
      .attach('file', PNG, { filename: 'pixel.png', contentType: 'image/png' })
      .expect(201);
    assetId = up.body.id as string;
    volA = up.body.volumeId as string;

    // mount a second local volume to move to
    const b = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/volumes`)
      .set('Authorization', auth())
      .send({ name: 'Archive', provider: 'local' })
      .expect(201);
    volB = b.body.id as string;
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('moves the asset to another volume and serves the same bytes from it', async () => {
    const before = await volumes().expect(200);
    const usedABefore = before.body.find((v: { id: string }) => v.id === volA).storageUsed;
    expect(usedABefore).toBe(PNG.length);

    const moved = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/assets/${assetId}/move`)
      .set('Authorization', auth())
      .send({ volumeId: volB })
      .expect(201);
    expect(moved.body.volumeId).toBe(volB);

    // bytes are now served from the destination volume
    const served = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/assets/${assetId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(Buffer.from(served.body).equals(PNG)).toBe(true);

    // usage accounting followed the bytes
    const after = await volumes().expect(200);
    expect(after.body.find((v: { id: string }) => v.id === volA).storageUsed).toBe(0);
    expect(after.body.find((v: { id: string }) => v.id === volB).storageUsed).toBe(PNG.length);
  });

  it('is a no-op when the target is the current volume', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/assets/${assetId}/move`)
      .set('Authorization', auth())
      .send({ volumeId: volB })
      .expect(201);
    expect(res.body.volumeId).toBe(volB);
  });

  it('404s when the target volume does not exist', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/assets/${assetId}/move`)
      .set('Authorization', auth())
      .send({ volumeId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);
  });

  it('404s when the asset does not exist', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/assets/00000000-0000-0000-0000-000000000000/move`)
      .set('Authorization', auth())
      .send({ volumeId: volA })
      .expect(404);
  });

  it('fails cleanly (not 500) when the destination is unreachable, leaving the asset put', async () => {
    // a fresh asset on the default local volume
    const up = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/assets`)
      .set('Authorization', auth())
      .attach('file', PNG, { filename: 'keep.png', contentType: 'image/png' })
      .expect(201);
    const id = up.body.id as string;
    const home = up.body.volumeId as string;

    // an S3 volume pointed at a closed port — writes will fail fast
    const bad = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/volumes`)
      .set('Authorization', auth())
      .send({
        name: 'Unreachable S3',
        provider: 's3',
        config: {
          bucket: 'nope',
          region: 'us-east-1',
          endpoint: 'http://127.0.0.1:1',
          accessKeyId: 'x',
          secretAccessKey: 'y',
        },
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/assets/${id}/move`)
      .set('Authorization', auth())
      .send({ volumeId: bad.body.id })
      .expect(400);
    expect(res.body.message).toMatch(/could not write to/i);

    // the asset is untouched: still on its volume and still served
    const still = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/assets/${id}`)
      .set('Authorization', auth())
      .expect(200);
    expect(Buffer.from(still.body).equals(PNG)).toBe(true);
    const list = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/assets`)
      .set('Authorization', auth())
      .expect(200);
    expect(list.body.find((x: { id: string }) => x.id === id).volumeId).toBe(home);
  });
});
