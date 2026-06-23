import { cn } from '@/lib/cn';

/**
 * Pole formularza: etykieta + input + opcjonalny stylowany błąd.
 * Walidacja jest własna (nie natywna) — formularze używają `noValidate`.
 */
export function Input({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  error?: string | null;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-fg3">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        className={cn(
          'rounded-[10px] border bg-card px-3.5 py-2.5 text-sm text-fg outline-none transition placeholder:text-fg3',
          error
            ? 'border-red-500/60 focus:border-red-500 focus:ring-2 focus:ring-red-500/30'
            : 'border-inputbd focus:border-acc focus:ring-2 focus:ring-accsoft',
        )}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  );
}
