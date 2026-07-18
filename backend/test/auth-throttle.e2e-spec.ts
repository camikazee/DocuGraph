import './auth-throttle-env'; // MUST be first: sets AUTH_THROTTLE_LIMIT=3
import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Auth rate limiting (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;

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
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
    // Nie pozwól, by ostry limit wyciekł do innych plików w tym samym workerze.
    process.env.AUTH_THROTTLE_LIMIT = '100000';
  });

  it('blocks (429) after the stricter auth limit is exceeded', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong-password-123' });
      codes.push(res.status);
    }
    // limit=3 → at most 3 non-429 responses, then 429s
    expect(codes).toContain(429);
    expect(codes.filter((c) => c !== 429).length).toBeLessThanOrEqual(3);
  });
});
