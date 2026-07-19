import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Private import token (config + no leak) (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let token: string;
  let ws: string;
  const http = () => app.getHttpServer();
  const auth = () => `Bearer ${token}`;
  const getSource = async () =>
    (
      await request(http())
        .get(`/api/v1/workspaces/${ws}/documents/source`)
        .set('Authorization', auth())
        .expect(200)
    ).body;

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
      .send({ email: 'pit@example.com', name: 'PIT', password: 'password123' })
      .expect(201);
    token = reg.body.accessToken;
    ws = (
      await request(http()).get('/api/v1/auth/me').set('Authorization', auth())
    ).body.workspaces[0].id;
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
  });

  it('stores the import token as a flag and never returns it', async () => {
    await request(http())
      .put(`/api/v1/workspaces/${ws}/documents/source`)
      .set('Authorization', auth())
      .send({
        provider: 'github',
        repo: 'octocat/private',
        token: 'ghp_supersecret',
      })
      .expect(200);

    const src = await getSource();
    expect(src.tokenConfigured).toBe(true);
    const serialized = JSON.stringify(src);
    expect(serialized).not.toContain('ghp_supersecret');
    expect(serialized).not.toContain('importToken');
    expect(src.token).toBeUndefined();
  });

  it('clears the token when set empty', async () => {
    await request(http())
      .put(`/api/v1/workspaces/${ws}/documents/source`)
      .set('Authorization', auth())
      .send({ token: '' })
      .expect(200);
    const src = await getSource();
    expect(src.tokenConfigured).toBe(false);
  });
});
