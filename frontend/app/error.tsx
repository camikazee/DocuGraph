'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

/** Granica błędu segmentu trasy (App Router). Stan „coś poszło nie tak". */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log po stronie klienta — w realnym wdrożeniu wysłać do Sentry/itp.
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="w-full max-w-[480px] overflow-hidden rounded-2xl border border-line bg-card p-10 text-center">
        {/* graph-node motif — broken edge */}
        <div className="mb-6 flex justify-center">
          <svg width="120" height="70" viewBox="0 0 120 70" fill="none">
            <line x1="60" y1="34" x2="28" y2="18" stroke="var(--line)" strokeWidth="1" />
            <line x1="60" y1="34" x2="92" y2="22" stroke="var(--fg3)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx="28" cy="18" r="5" fill="var(--rowhover)" stroke="var(--fg3)" strokeWidth="1" />
            <circle cx="92" cy="22" r="5" fill="var(--rowhover)" stroke="var(--fg3)" strokeWidth="1" strokeDasharray="2 2" />
            <circle cx="60" cy="34" r="10" fill="#ef4444" stroke="#fca5a5" strokeWidth="1.4" />
            <path d="M60 30v4.5M60 38v.1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <div className="text-5xl font-bold tracking-tight text-fg">500</div>
        <div className="mt-2 text-lg font-semibold text-fg">
          Something went wrong on our side
        </div>
        <p className="mx-auto mt-2 max-w-[340px] text-sm leading-relaxed text-fg3">
          An unexpected error interrupted this page. Try again — if it keeps
          happening, the issue is on the server, not your document.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button href="/dashboard" variant="secondary">
            Back to dashboard
          </Button>
        </div>
        {error.digest && (
          <div className="mt-7 font-mono text-[11.5px] text-muted">
            error id: {error.digest}
          </div>
        )}
      </div>
    </main>
  );
}
