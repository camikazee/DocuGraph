import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' });

describe('Publish to Git (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let token: string;
  let ws: string;

  let tmp: string;
  let bare: string; // remote bare repo
  const auth = () => `Bearer ${token}`;

  const setSource = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .put(`/api/v1/workspaces/${ws}/documents/source`)
      .set('Authorization', auth())
      .send(body);
  const addDoc = (file_path: string, content_raw: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/documents`)
      .set('Authorization', auth())
      .send({ file_path, content_raw });
  const publish = (message?: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws}/documents/source/publish`)
      .set('Authorization', auth())
      .send(message ? { message } : {});

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
        email: 'pub@example.com',
        name: 'Publisher',
        password: 'password123',
      })
      .expect(201);
    token = reg.body.accessToken as string;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', auth())
      .expect(200);
    ws = me.body.workspaces[0].id as string;

    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dg-pub-'));
    bare = path.join(tmp, 'remote.git');
    await fs.mkdir(bare, { recursive: true });
    git(bare, ['init', '--bare', '--initial-branch=main']);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it('requires a push remote to be configured', async () => {
    const res = await publish().expect(400);
    expect(res.body.message).toMatch(/configure a push remote/i);
  });

  it('hides the remote but reports pushConfigured', async () => {
    await setSource({ branch: 'main', pushRemote: bare }).expect(200);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws}/documents/source`)
      .set('Authorization', auth())
      .expect(200);
    expect(res.body.pushConfigured).toBe(true);
    expect(res.body.pushRemote).toBeUndefined();
  });

  it('commits & pushes the workspace docs to the remote', async () => {
    await addDoc('guide/intro.md', '# Intro\n\nWelcome.').expect(201);
    await addDoc('api/auth.md', '# Auth\n\nTokens.').expect(201);

    const res = await publish('Initial docs').expect(201);
    expect(res.body.pushed).toBe(true);
    expect(res.body.files).toBe(2);
    expect(res.body.commit).toMatch(/^[0-9a-f]{7,40}$/);

    // clone the bare repo and verify the files + commit landed
    const verify = path.join(tmp, 'verify');
    git(tmp, ['clone', bare, verify]);
    const intro = await fs.readFile(
      path.join(verify, 'guide/intro.md'),
      'utf8',
    );
    const authmd = await fs.readFile(path.join(verify, 'api/auth.md'), 'utf8');
    expect(intro).toContain('Welcome.');
    expect(authmd).toContain('Tokens.');
    const log = git(verify, ['log', '--pretty=%s|%an']);
    expect(log).toContain('Initial docs|Publisher');
    await fs.rm(verify, { recursive: true, force: true });
  });

  it('is a no-op when nothing changed since the last publish', async () => {
    const res = await publish('No changes').expect(201);
    expect(res.body.pushed).toBe(false);
    expect(res.body.message).toMatch(/already up to date|nothing to publish/i);
  });

  it('publishes again after a document changes', async () => {
    await addDoc('api/auth.md', '# Auth\n\nTokens and refresh.').expect(201);
    const res = await publish('Update auth doc').expect(201);
    expect(res.body.pushed).toBe(true);

    const verify = path.join(tmp, 'verify2');
    git(tmp, ['clone', bare, verify]);
    const authmd = await fs.readFile(path.join(verify, 'api/auth.md'), 'utf8');
    expect(authmd).toContain('refresh.');
    await fs.rm(verify, { recursive: true, force: true });
  });
});
