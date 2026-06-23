import { createHash, randomBytes } from 'crypto';

/** Hash do przechowywania w bazie (nigdy nie trzymamy surowego tokena). */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Generuje losowy token: zwraca surowiec (do pokazania raz) i jego hash.
 * @param prefix opcjonalny prefiks, np. 'dg_live_' dla kluczy CI/CD.
 */
export function generateToken(prefix = ''): { raw: string; hash: string } {
  const raw = prefix + randomBytes(32).toString('hex');
  return { raw, hash: hashToken(raw) };
}
