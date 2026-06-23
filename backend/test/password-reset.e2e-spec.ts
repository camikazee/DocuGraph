import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { MailerService } from '../src/common/mailer/mailer.service';
import { User, UserDocument } from '../src/users/schemas/user.schema';

describe('Password reset (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let mailer: MailerService;
  let userModel: Model<UserDocument>;

  const EMAIL = 'reset@example.com';
  const OLD = 'oldpassword123';
  const NEW = 'brandnewpass456';

  const forgot = (email: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/forgot').send({ email });
  const reset = (token: string, password: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/reset')
      .send({ token, password });
  const login = (email: string, password: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });

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
    mailer = app.get<MailerService>(MailerService);
    userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
    await connection.dropDatabase();

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: EMAIL, name: 'Resetter', password: OLD })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a generic message and sends no mail for an unknown email', async () => {
    mailer.lastSent = null;
    const res = await forgot('nobody@example.com').expect(200);
    expect(res.body.message).toMatch(/if an account exists/i);
    expect(mailer.lastSent).toBeNull();
  });

  it('rejects a bogus reset token (400)', async () => {
    await reset('0'.repeat(64), NEW).expect(400);
  });

  it('completes the full reset flow and enforces single use', async () => {
    // request → generic response, mail captured (dev/test only)
    const res = await forgot(EMAIL).expect(200);
    expect(res.body.message).toMatch(/if an account exists/i);
    const token = mailer.lastSent?.token as string;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(mailer.lastSent?.to).toBe(EMAIL);

    // reset with the token
    await reset(token, NEW).expect(200);

    // old password no longer works, new one does
    await login(EMAIL, OLD).expect(401);
    await login(EMAIL, NEW).expect(201);

    // the token is single-use — replaying it fails
    await reset(token, 'anotherpass789').expect(400);
    await login(EMAIL, 'anotherpass789').expect(401);
  });

  it('rejects an expired token (400)', async () => {
    await forgot(EMAIL).expect(200);
    const token = mailer.lastSent?.token as string;
    // force expiry into the past
    await userModel
      .updateOne(
        { email: EMAIL },
        { $set: { passwordResetExpires: new Date(Date.now() - 1000) } },
      )
      .exec();
    await reset(token, 'shouldnotapply123').expect(400);
    // password unchanged
    await login(EMAIL, NEW).expect(201);
  });

  it('never exposes reset fields on the profile', async () => {
    const me = await login(EMAIL, NEW).expect(201);
    const profile = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${me.body.accessToken}`)
      .expect(200);
    expect(profile.body.user.passwordResetTokenHash).toBeUndefined();
    expect(profile.body.user.passwordHash).toBeUndefined();
  });
});
