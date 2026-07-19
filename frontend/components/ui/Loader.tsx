import { cn } from '@/lib/cn';
import { Button } from './Button';

/** Kręcące się kółko w kolorze akcentu motywu. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9" stroke="var(--line)" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="var(--acc)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Pulsujący placeholder treści (np. wiersz listy podczas ładowania). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-rowhover', className)} />;
}

interface LoaderProps {
  /** Trwa pobieranie danych. */
  loading: boolean;
  /** Komunikat błędu (jeśli pobieranie się nie powiodło). */
  error?: string | null;
  /** Dane się załadowały, ale są puste. */
  empty?: boolean;
  /** Ponów próbę (pokazuje przycisk „Try again" w stanie błędu). */
  onRetry?: () => void;
  /** Własny placeholder ładowania (domyślnie wyśrodkowany spinner). */
  skeleton?: React.ReactNode;
  /** Tytuł/komunikat pustego stanu. */
  emptyTitle?: string;
  emptyMessage?: string;
  /** Opcjonalne akcje (CTA) w pustym stanie — np. „New document", „Import". */
  emptyAction?: React.ReactNode;
  /** Minimalna wysokość obszaru stanów (żeby nie „skakał" układ). */
  minHeight?: number | string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Wrapper wokół treści zależnej od danych asynchronicznych.
 * Renderuje stan ładowania / błędu / pustki, a gdy dane są gotowe — `children`.
 *
 *   <Loader loading={!data} error={err} empty={data?.length === 0} onRetry={reload}>
 *     <List items={data} />
 *   </Loader>
 */
export function Loader({
  loading,
  error,
  empty,
  onRetry,
  skeleton,
  emptyTitle = 'Nothing here yet',
  emptyMessage,
  emptyAction,
  minHeight = 160,
  className,
  children,
}: LoaderProps) {
  const center = cn('grid place-items-center px-4 py-10 text-center', className);
  const style = { minHeight };

  if (loading) {
    return (
      <div className={center} style={style}>
        {skeleton ?? (
          <div className="flex flex-col items-center gap-3 text-fg3">
            <Spinner />
            <span className="text-[13px]">Loading…</span>
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className={center} style={style}>
        <div className="flex max-w-[340px] flex-col items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-red-500/30 bg-red-500/10">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.3" stroke="#ef4444" strokeWidth="1.3" />
              <path d="M8 5v3.4M8 10.5v.1" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <div className="text-[13.5px] font-semibold text-fg">Couldn&apos;t load this</div>
          <p className="text-[12.5px] leading-relaxed text-fg3">{error}</p>
          {onRetry && (
            <Button variant="secondary" onClick={onRetry} className="mt-1">
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (empty) {
    return (
      <div className={center} style={style}>
        <div className="flex max-w-[340px] flex-col items-center gap-2">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-capbg">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5Z" stroke="var(--fg3)" strokeWidth="1.2" />
              <path d="M9 1.6V4.5h3" stroke="var(--fg3)" strokeWidth="1.2" />
            </svg>
          </span>
          <div className="text-[13.5px] font-semibold text-fg">{emptyTitle}</div>
          {emptyMessage && <p className="text-[12.5px] leading-relaxed text-fg3">{emptyMessage}</p>}
          {emptyAction && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {emptyAction}
            </div>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
