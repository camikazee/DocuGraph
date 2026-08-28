import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Dirent, promises as fs } from 'fs';
import * as path from 'path';

/**
 * Zapis/odczyt plików .md na dysku, z izolacją per workspace
 * i twardą ochroną przed path traversal.
 */
@Injectable()
export class WorkspaceStorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(
      config.get<string>('workspaceRoot') ?? './workspaces',
    );
  }

  /**
   * Waliduje względną ścieżkę dokumentu i zwraca bezpieczną ścieżkę absolutną
   * wewnątrz katalogu workspace. Rzuca 400 dla ścieżek niedozwolonych.
   */
  resolveSafePath(workspaceId: string, filePath: string): string {
    if (!filePath || typeof filePath !== 'string') {
      throw new BadRequestException('file_path is required');
    }
    if (path.isAbsolute(filePath)) {
      throw new BadRequestException('file_path must be relative');
    }
    if (!filePath.toLowerCase().endsWith('.md')) {
      throw new BadRequestException('file_path must point to a .md file');
    }

    const normalized = path.normalize(filePath).replace(/^(\.\/)+/, '');
    if (
      normalized.startsWith('..') ||
      normalized.split(path.sep).includes('..')
    ) {
      throw new BadRequestException('file_path must not escape the workspace');
    }

    const baseDir = path.resolve(this.root, workspaceId);
    const full = path.resolve(baseDir, normalized);
    if (full !== baseDir && !full.startsWith(baseDir + path.sep)) {
      throw new BadRequestException('Resolved path escapes the workspace');
    }
    return full;
  }

  async writeFile(
    workspaceId: string,
    filePath: string,
    content: string,
  ): Promise<void> {
    const full = this.resolveSafePath(workspaceId, filePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const temporary = `${full}.${randomUUID()}.tmp`;
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
    try {
      handle = await fs.open(temporary, 'wx');
      await handle.writeFile(content, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temporary, full);
    } finally {
      await handle?.close().catch(() => undefined);
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  async readFile(workspaceId: string, filePath: string): Promise<string> {
    const full = this.resolveSafePath(workspaceId, filePath);
    return fs.readFile(full, 'utf8');
  }

  /** Usuwa plik .md (np. po przeniesieniu). Brak pliku nie jest błędem. */
  async deleteFile(workspaceId: string, filePath: string): Promise<void> {
    const full = this.resolveSafePath(workspaceId, filePath);
    await fs.rm(full, { force: true });
  }

  /** Zwraca kanoniczne ścieżki wszystkich plików Markdown workspace. */
  async listFiles(workspaceId: string): Promise<string[]> {
    const base = path.resolve(this.root, workspaceId);
    const files: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      let entries: Dirent<string>[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw err;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          files.push(path.relative(base, full).split(path.sep).join('/'));
        }
      }
    };

    await walk(base);
    return files.sort();
  }
}
