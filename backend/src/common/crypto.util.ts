import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

/**
 * Szyfrowanie sekretów at-rest (poświadczenia wolumenów: klucze S3, hasła FTP).
 * AES-256-GCM; klucz wyprowadzony z MEDIA_SECRET (lub JWT_SECRET) przez SHA-256.
 * Format: base64(iv):base64(tag):base64(ciphertext).
 */
function deriveKey(): Buffer {
  const secret =
    process.env.MEDIA_SECRET ||
    process.env.JWT_SECRET ||
    'dev-media-secret-change-me';
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(blob: string): string {
  const [ivB, tagB, dataB] = blob.split(':');
  if (!ivB || !tagB || !dataB) {
    throw new Error('Malformed encrypted secret');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(),
    Buffer.from(ivB, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
