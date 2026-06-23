import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  ConnectionResult,
  StorageProvider,
} from './storage-provider.interface';

/** Pełny provider lokalny: pliki pod katalogiem wolumenu, z ochroną traversal. */
export class LocalDiskProvider implements StorageProvider {
  constructor(private readonly baseDir: string) {}

  private resolve(rel: string): string {
    const norm = path.normalize(rel).replace(/^(\.\/)+/, '');
    if (path.isAbsolute(norm) || norm.split(path.sep).includes('..')) {
      throw new BadRequestException('Invalid asset path');
    }
    const full = path.resolve(this.baseDir, norm);
    if (full !== this.baseDir && !full.startsWith(this.baseDir + path.sep)) {
      throw new BadRequestException('Asset path escapes the volume');
    }
    return full;
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      return { ok: true, message: 'Local volume directory is writable' };
    } catch {
      return { ok: false, message: 'Cannot create the local volume directory' };
    }
  }

  async put(rel: string, data: Buffer): Promise<void> {
    const full = this.resolve(rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async get(rel: string): Promise<Buffer> {
    return fs.readFile(this.resolve(rel));
  }

  async delete(rel: string): Promise<void> {
    await fs.rm(this.resolve(rel), { force: true });
  }
}
