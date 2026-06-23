export interface ConnectionResult {
  ok: boolean;
  message: string;
}

/** Abstrakcja storage — bajty assetów. Implementacje: local / s3 / ftp. */
export interface StorageProvider {
  testConnection(): Promise<ConnectionResult>;
  put(path: string, data: Buffer, mime: string): Promise<void>;
  get(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
}
