import './setup-env';
// Niski limit tylko dla tego pliku — weryfikujemy, że throttler realnie blokuje.
process.env.THROTTLE_LIMIT = '5';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    process.env.THROTTLE_LIMIT = '100000';
  });

  it('blokuje (429) po przekroczeniu limitu żądań', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await request(app.getHttpServer()).get('/api/v1/health');
      codes.push(res.status);
    }
    expect(codes).toContain(429);
    expect(codes.filter((c) => c === 200).length).toBeLessThanOrEqual(5);
  });
});
