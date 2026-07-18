import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Observability: health/ready + request-id (e2e)', () => {
  let app: INestApplication;

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
  });

  afterAll(async () => {
    await app?.close();
  });

  it('liveness /health is 200 with uptime', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('readiness /ready is 200 with db up (mongo connected)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/ready')
      .expect(200);
    expect(res.body).toMatchObject({ status: 'ready', db: 'up' });
  });

  it('echoes a provided x-request-id header', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'test-rid-123')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('test-rid-123');
  });

  it('generates an x-request-id when none is provided', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('includes the request id in error responses', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/definitely-not-a-route')
      .set('x-request-id', 'err-rid-456')
      .expect(404);
    expect(res.body.requestId).toBe('err-rid-456');
    expect(res.headers['x-request-id']).toBe('err-rid-456');
  });
});
