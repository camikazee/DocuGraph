/** Proste walidatory pól — zwracają komunikat błędu lub null. */
export type Validator = (value: string) => string | null;

export function required(value: string): string | null {
  return value.trim().length > 0 ? null : 'This field is required';
}

export function isEmail(value: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    ? null
    : 'Enter a valid email address';
}

export function minLength(n: number): Validator {
  return (value: string) =>
    value.length >= n ? null : `Must be at least ${n} characters`;
}

/** Zwraca pierwszy napotkany błąd z listy walidatorów (lub null). */
export function firstError(value: string, validators: Validator[]): string | null {
  for (const v of validators) {
    const err = v(value);
    if (err) return err;
  }
  return null;
}
