import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkspaceStorageService } from './workspace-storage.service';

describe('WorkspaceStorageService', () => {
  let service: WorkspaceStorageService;
  let root: string;

  beforeAll(async () => {
    root = path.join(os.tmpdir(), 'docugraph-storage-test');
    await fs.rm(root, { recursive: true, force: true });
    const config = {
      get: (key: string) => (key === 'workspaceRoot' ? root : undefined),
    } as unknown as ConfigService;
    service = new WorkspaceStorageService(config);
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('zapisuje i odczytuje plik wewnątrz workspace', async () => {
    await service.writeFile('ws1', 'docs/api/auth.md', '# Hello');
    const content = await service.readFile('ws1', 'docs/api/auth.md');
    expect(content).toBe('# Hello');
    const entries = await fs.readdir(path.join(root, 'ws1', 'docs/api'));
    expect(entries).toEqual(['auth.md']);
  });

  it('zachowuje poprzednią treść i sprząta temp po błędzie rename', async () => {
    await service.writeFile('ws1', 'safe.md', '# Previous');
    const rename = jest
      .spyOn(fs, 'rename')
      .mockRejectedValueOnce(new Error('disk'));

    await expect(service.writeFile('ws1', 'safe.md', '# New')).rejects.toThrow(
      'disk',
    );
    rename.mockRestore();
    await expect(service.readFile('ws1', 'safe.md')).resolves.toBe(
      '# Previous',
    );
    const entries = await fs.readdir(path.join(root, 'ws1'));
    expect(entries.filter((entry) => entry.includes('.tmp'))).toEqual([]);
  });

  it('izoluje pliki per workspace (ścieżka zawiera id workspace)', () => {
    const full = service.resolveSafePath('ws-abc', 'a/b.md');
    expect(full).toContain(`${path.sep}ws-abc${path.sep}`);
  });

  it('odrzuca path traversal', () => {
    expect(() => service.resolveSafePath('ws1', '../secret.md')).toThrow();
    expect(() => service.resolveSafePath('ws1', 'a/../../b.md')).toThrow();
  });

  it('odrzuca ścieżkę absolutną', () => {
    expect(() => service.resolveSafePath('ws1', '/etc/passwd.md')).toThrow();
  });

  it('odrzuca rozszerzenie inne niż .md', () => {
    expect(() => service.resolveSafePath('ws1', 'notes.txt')).toThrow();
  });
});
