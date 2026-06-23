import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { decryptSecret } from '../../common/crypto.util';
import { VolumeDocument } from '../schemas/volume.schema';
import { StorageProvider } from './storage-provider.interface';
import { LocalDiskProvider } from './local-disk.provider';
import { S3Provider } from './s3.provider';
import { FtpProvider } from './ftp.provider';

const SECRET_FIELDS = ['accessKeyId', 'secretAccessKey', 'password'];

@Injectable()
export class ProviderFactory {
  constructor(private readonly config: ConfigService) {}

  /** Buduje provider dla wolumenu (z odszyfrowaną konfiguracją). */
  for(volume: VolumeDocument): StorageProvider {
    const cfg = this.decryptConfig(volume.config);
    switch (volume.provider) {
      case 'local': {
        const root = path.resolve(
          this.config.get<string>('workspaceRoot') ?? './workspaces',
        );
        const base = path.join(
          root,
          volume.workspaceId.toString(),
          '.media',
          volume._id.toString(),
        );
        return new LocalDiskProvider(base);
      }
      case 's3':
        return new S3Provider({
          bucket: cfg.bucket,
          region: cfg.region,
          endpoint: cfg.endpoint,
          accessKeyId: cfg.accessKeyId,
          secretAccessKey: cfg.secretAccessKey,
        });
      case 'ftp':
        return new FtpProvider({
          protocol: cfg.protocol,
          host: cfg.host,
          port: Number(cfg.port) || 0,
          username: cfg.username,
          password: cfg.password,
          basePath: cfg.basePath,
        });
      default:
        throw new Error(`Unknown provider: ${String(volume.provider)}`);
    }
  }

  /** Odszyfrowuje pola sekretne w konfiguracji. */
  decryptConfig(config: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = { ...(config ?? {}) };
    for (const field of SECRET_FIELDS) {
      if (out[field]) {
        try {
          out[field] = decryptSecret(out[field]);
        } catch {
          // pozostaw bez zmian, jeśli nie da się odszyfrować
        }
      }
    }
    return out;
  }
}

export { SECRET_FIELDS };
