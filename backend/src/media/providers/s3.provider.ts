import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  ConnectionResult,
  StorageProvider,
} from './storage-provider.interface';

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/** Provider S3 (działa też z MinIO/S3-compatible przez `endpoint`). */
export class S3Provider implements StorageProvider {
  private readonly client: S3Client;

  constructor(private readonly cfg: S3Config) {
    this.client = new S3Client({
      region: cfg.region || 'us-east-1',
      endpoint: cfg.endpoint?.trim() || undefined,
      forcePathStyle: !!cfg.endpoint?.trim(), // MinIO / custom endpoint
      credentials:
        cfg.accessKeyId && cfg.secretAccessKey
          ? {
              accessKeyId: cfg.accessKeyId,
              secretAccessKey: cfg.secretAccessKey,
            }
          : undefined,
    });
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.cfg.bucket }),
      );
      return { ok: true, message: `Bucket "${this.cfg.bucket}" reachable` };
    } catch (e) {
      const err = e as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      const code = err.$metadata?.httpStatusCode;
      if (code === 403) {
        return { ok: false, message: 'Access denied — check credentials' };
      }
      if (code === 404) {
        return { ok: false, message: `Bucket "${this.cfg.bucket}" not found` };
      }
      return { ok: false, message: 'S3 endpoint is unreachable' };
    }
  }

  async put(path: string, data: Buffer, mime: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: path,
        Body: data,
        ContentType: mime,
      }),
    );
  }

  async get(path: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: path }),
    );
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(path: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: path }),
    );
  }
}
