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

const git = (args: string[]) => execFileSync('git', args, { encoding: 'utf8' });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Auto bidirectional sync (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let token: string;
  let ws: string;
  let tmp: string;
  let bare: string;

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

  const commitCount = (): number => {
    try {
      return parseInt(git(['--git-dir', bare, 'rev-list', '--count', 'main']).trim(), 10);
    } catch {
      return 0;
    }
  };
  const fileAt = (rel: string): string | null => {
    try {
      return git(['--git-dir', bare, 'show', `main:${rel}`]);
    } catch {
      return null;
    }
  };
  async function waitFor(fn: () => boolean, timeoutMs = 8000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (fn()) return true;
      await sleep(250);
    }
    return false;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    await connection.dropDatabase();

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'sync@example.com', name: 'Syncer', password: 'password123' })
      .expect(201);
    token = reg.body.accessToken as string;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', auth())
      .expect(200);
    ws = me.body.workspaces[0].id as string;

    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dg-sync-'));
    bare = path.join(tmp, 'remote.git');
    await fs.mkdir(bare, { recursive: true });
    git(['init', '--bare', '--initial-branch=main', bare]);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    await app?.close();
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it('auto-pushes a document edit when bidirectional sync is on', async () => {
    await setSource({ branch: 'main', pushRemote: bare, bidirectional: true }).expect(200);

    await addDoc('notes/auto.md', '# Auto\n\nversion one').expect(201);

    const landed = await waitFor(() => fileAt('notes/auto.md') !== null);
    expect(landed).toBe(true);
    expect(fileAt('notes/auto.md')).toContain('version one');

    const log = git(['--git-dir', bare, 'log', '-1', '--pretty=%s|%an']);
    expect(log).toContain('Auto-sync from DocuGraph|DocuGraph');
  });

  it('coalesces rapid edits and pushes the latest content', async () => {
    await addDoc('notes/auto.md', '# Auto\n\nversion two').expect(201);
    await addDoc('notes/auto.md', '# Auto\n\nversion three').expect(201);

    const got = await waitFor(() => (fileAt('notes/auto.md') ?? '').includes('version three'));
    expect(got).toBe(true);
  });

  it('does not push when bidirectional sync is off', async () => {
    await setSource({ bidirectional: false }).expect(200);
    const before = commitCount();

    await addDoc('notes/manual.md', 'should not auto-push').expect(201);

    // give any (incorrect) background push time to happen
    await sleep(1500);
    expect(commitCount()).toBe(before);
    expect(fileAt('notes/manual.md')).toBeNull();
  });
});
