import SftpClient from 'ssh2-sftp-client';
import { Client as FtpClient } from 'basic-ftp';
import { Readable, Writable } from 'stream';
import * as path from 'path';
import {
  ConnectionResult,
  StorageProvider,
} from './storage-provider.interface';

export interface FtpConfig {
  protocol: string; // 'ftp' | 'sftp'
  host: string;
  port: number;
  username?: string;
  password?: string;
  basePath?: string;
}

/** Provider FTP/SFTP — pełny transfer plików (po protokole). */
export class FtpProvider implements StorageProvider {
  constructor(private readonly cfg: FtpConfig) {}

  private get isSftp(): boolean {
    return (this.cfg.protocol || 'sftp').toLowerCase() === 'sftp';
  }
  private get port(): number {
    return this.cfg.port || (this.isSftp ? 22 : 21);
  }
  private remote(rel: string): string {
    const base = (this.cfg.basePath || '').replace(/\/+$/, '');
    return [base, rel]
      .filter(Boolean)
      .join('/')
      .replace(/\/{2,}/g, '/');
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      if (this.isSftp) {
        const c = new SftpClient();
        await c.connect({
          host: this.cfg.host,
          port: this.port,
          username: this.cfg.username,
          password: this.cfg.password,
          readyTimeout: 6000,
        });
        await c.end();
      } else {
        const c = new FtpClient(6000);
        await c.access({
          host: this.cfg.host,
          port: this.port,
          user: this.cfg.username,
          password: this.cfg.password,
          secure: false,
        });
        c.close();
      }
      return {
        ok: true,
        message: `${this.cfg.protocol.toUpperCase()} connection OK`,
      };
    } catch (e) {
      return {
        ok: false,
        message: (e as Error).message || 'Connection failed',
      };
    }
  }

  async put(rel: string, data: Buffer): Promise<void> {
    const remote = this.remote(rel);
    if (this.isSftp) {
      const c = new SftpClient();
      try {
        await c.connect({
          host: this.cfg.host,
          port: this.port,
          username: this.cfg.username,
          password: this.cfg.password,
        });
        const dir = path.posix.dirname(remote);
        if (dir && dir !== '.') await c.mkdir(dir, true);
        await c.put(data, remote);
      } finally {
        await c.end();
      }
    } else {
      const c = new FtpClient();
      try {
        await c.access({
          host: this.cfg.host,
          port: this.port,
          user: this.cfg.username,
          password: this.cfg.password,
          secure: false,
        });
        const dir = path.posix.dirname(remote);
        if (dir && dir !== '.') await c.ensureDir(dir);
        await c.uploadFrom(Readable.from(data), path.posix.basename(remote));
      } finally {
        c.close();
      }
    }
  }

  async get(rel: string): Promise<Buffer> {
    const remote = this.remote(rel);
    if (this.isSftp) {
      const c = new SftpClient();
      try {
        await c.connect({
          host: this.cfg.host,
          port: this.port,
          username: this.cfg.username,
          password: this.cfg.password,
        });
        return (await c.get(remote)) as Buffer;
      } finally {
        await c.end();
      }
    }
    const c = new FtpClient();
    try {
      await c.access({
        host: this.cfg.host,
        port: this.port,
        user: this.cfg.username,
        password: this.cfg.password,
        secure: false,
      });
      const chunks: Buffer[] = [];
      const sink = new Writable({
        write(chunk, _enc, cb) {
          chunks.push(Buffer.from(chunk));
          cb();
        },
      });
      await c.downloadTo(sink, remote);
      return Buffer.concat(chunks);
    } finally {
      c.close();
    }
  }

  async delete(rel: string): Promise<void> {
    const remote = this.remote(rel);
    if (this.isSftp) {
      const c = new SftpClient();
      try {
        await c.connect({
          host: this.cfg.host,
          port: this.port,
          username: this.cfg.username,
          password: this.cfg.password,
        });
        await c.delete(remote).catch(() => undefined);
      } finally {
        await c.end();
      }
    } else {
      const c = new FtpClient();
      try {
        await c.access({
          host: this.cfg.host,
          port: this.port,
          user: this.cfg.username,
          password: this.cfg.password,
          secure: false,
        });
        await c.remove(remote).catch(() => undefined);
      } finally {
        c.close();
      }
    }
  }
}
