import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Request } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { GithubAuthGuard } from '../src/auth/guards/github-auth.guard';
import { OAuthProfile } from '../src/auth/interfaces/oauth-profile.interface';

describe('GitHub OAuth (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;

  // Profil wstrzykiwany przez zamockowany guard — mutowalny per test.
  let fakeProfile: OAuthProfile;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(GithubAuthGuard)
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
    if (connection) {
      await connection.dropDatabase();
    }
    await app?.close();
  });

  /** Callback przekierowuje do frontendu z JWT w fragmencie URL — wyłuskaj go. */
  function tokenFromRedirect(location: string): string {
    const hash = location.split('#')[1] ?? '';
    return new URLSearchParams(hash).get('token') ?? '';
  }

  it('callback tworzy nowego usera z workspace i przekierowuje z JWT', async () => {
    fakeProfile = {
      providerUserId: 'gh-1',
      email: 'octocat@example.com',
      name: 'Octo Cat',
      username: 'octocat',
      avatarUrl: 'https://example.com/a.png',
    };

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/github/callback')
      .expect(302);

    const token = tokenFromRedirect(res.headers.location as string);
    expect(token).not.toBe('');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.user.email).toBe('octocat@example.com');
    expect(me.body.workspaces).toHaveLength(1);
    expect(me.body.workspaces[0].role).toBe('owner');
  });

  it('przekazuje `next` przez OAuth state do frontendu', async () => {
    fakeProfile = {
      providerUserId: 'gh-3',
      email: 'stateful@example.com',
      name: 'Stateful',
      username: 'stateful',
      avatarUrl: null,
    };

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/github/callback')
      .query({ state: '/invite?token=abc' })
      .expect(302);

    const loc = res.headers.location as string;
    expect(loc).toContain('/oauth#');
    expect(tokenFromRedirect(loc)).not.toBe('');
    expect(loc).toContain('next=');
  });

  it('scala z istniejącym kontem e-mail/hasło (bez duplikatu)', async () => {
    // Najpierw konto klasyczne.
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'merge@example.com',
        name: 'Merge User',
        password: 'password123',
      })
      .expect(201);

    // Ten sam e-mail przychodzi z GitHuba.
    fakeProfile = {
      providerUserId: 'gh-2',
      email: 'merge@example.com',
      name: 'Merge User',
      username: 'mergeuser',
      avatarUrl: null,
    };

    const gh = await request(app.getHttpServer())
      .get('/api/v1/auth/github/callback')
      .expect(302);

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(
        'Authorization',
        `Bearer ${tokenFromRedirect(gh.headers.location as string)}`,
      )
      .expect(200);

    // Nadal jeden workspace — konto zostało scalone, nie zduplikowane.
    expect(me.body.workspaces).toHaveLength(1);

    // Logowanie hasłem wciąż działa (to ten sam user).
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'merge@example.com', password: 'password123' })
      .expect(201);
  });
});
