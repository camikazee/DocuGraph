import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { hydrateFileSecrets } from './file-secrets';

describe('hydrateFileSecrets', () => {
  let dir: string;
  const saved = { ...process.env };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dg-secrets-'));
  });
  afterEach(() => {
    process.env = { ...saved };
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads FOO from FOO_FILE and strips a trailing newline', () => {
    const f = join(dir, 'jwt');
    writeFileSync(f, 'super-secret-value\n');
    delete process.env.MY_JWT;
    process.env.MY_JWT_FILE = f;

    const loaded = hydrateFileSecrets({ warn: () => {} });

    expect(process.env.MY_JWT).toBe('super-secret-value');
    expect(loaded).toContain('MY_JWT');
  });

  it('does not override an explicitly set env var', () => {
    const f = join(dir, 'jwt');
    writeFileSync(f, 'from-file');
    process.env.MY_JWT = 'from-env';
    process.env.MY_JWT_FILE = f;

    hydrateFileSecrets({ warn: () => {} });

    expect(process.env.MY_JWT).toBe('from-env');
  });

  it('warns and leaves the var unset when the file is missing', () => {
    delete process.env.MY_JWT;
    process.env.MY_JWT_FILE = join(dir, 'nope');
    const warn = jest.fn();

    hydrateFileSecrets({ warn });

    expect(process.env.MY_JWT).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('preserves internal characters (only the final newline is trimmed)', () => {
    const f = join(dir, 'multiline');
    writeFileSync(f, 'a b\nc d\n');
    delete process.env.MY_VAL;
    process.env.MY_VAL_FILE = f;

    hydrateFileSecrets({ warn: () => {} });

    expect(process.env.MY_VAL).toBe('a b\nc d');
  });
});
