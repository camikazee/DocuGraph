import { randomBytes } from 'crypto';

// Zakres łączących znaków diakrytycznych (U+0300–U+036F), usuwany po NFKD.
const DIACRITICS = /[̀-ͯ]/g;

/** Zamienia dowolny tekst na bezpieczny slug (a-z, 0-9, myślniki). */
export function slugify(input: string): string {
  const base = input
    .normalize('NFKD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'workspace';
}

/** Krótki losowy sufiks do zapewnienia unikalności slugów. */
export function randomSlugSuffix(): string {
  return randomBytes(3).toString('hex'); // 6 znaków hex
}
