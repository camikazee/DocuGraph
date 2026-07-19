import './setup-env';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Request } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { SlackAuthGuard } from '../src/auth/guards/slack-auth.guard';
import { OAuthProfile } from '../src/auth/interfaces/oauth-profile.interface';

describe('Slack OAuth (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let fakeProfile: OAuthProfile;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(SlackAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest<Request>();
          req.user = fakeProfile;
          return true;
        },
      })
      .compile();

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
  });

  /** Callback przekierowuje do frontendu z JWT w fragmencie URL — wyłuskaj go. */
  function tokenFromRedirect(location: string): string {
    const hash = location.split('#')[1] ?? '';
    return new URLSearchParams(hash).get('token') ?? '';
  }

  it('callback tworzy nowego usera z workspace i przekierowuje z JWT', async () => {
    fakeProfile = {
      providerUserId: 'slack-1',
      email: 'slacker@example.com',
      name: 'Slacker',
      username: 'slacker@example.com',
      avatarUrl: null,
    };

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/slack/callback')
      .expect(302);
    const token = tokenFromRedirect(res.headers.location as string);
    expect(token).not.toBe('');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.user.email).toBe('slacker@example.com');
    expect(me.body.workspaces).toHaveLength(1);
    expect(me.body.workspaces[0].role).toBe('owner');
  });

  it('scala z istniejącym kontem e-mail/hasło (bez duplikatu)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'mix@example.com',
        name: 'Mix',
        password: 'password123',
      })
      .expect(201);

    fakeProfile = {
      providerUserId: 'slack-2',
      email: 'mix@example.com',
      name: 'Mix',
      username: 'mix@example.com',
      avatarUrl: null,
    };

    const gh = await request(app.getHttpServer())
      .get('/api/v1/auth/slack/callback')
      .expect(302);

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(
        'Authorization',
        `Bearer ${tokenFromRedirect(gh.headers.location as string)}`,
      )
      .expect(200);
    expect(me.body.workspaces).toHaveLength(1);

    // logowanie hasłem nadal działa
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'mix@example.com', password: 'password123' })
      .expect(201);
  });
});
