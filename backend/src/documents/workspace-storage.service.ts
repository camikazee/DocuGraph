import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
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
    await fs.writeFile(full, content, 'utf8');
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
}
