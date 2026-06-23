/** Łączy klasy CSS, pomijając wartości fałszywe. */
export function cn(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(' ');
}
