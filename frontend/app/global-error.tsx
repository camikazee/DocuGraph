'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/report-error';

/**
 * Granica błędu poziomu root layout — zastępuje cały layout, więc renderuje
 * własne <html>/<body> i nie ma dostępu do globals.css. Stąd style inline
 * z literalnymi kolorami motywu (domyślny violet).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    void reportClientError(error.message, error.stack);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#070b16',
          color: '#94a3b8',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: 16,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 480,
            padding: 40,
            textAlign: 'center',
            borderRadius: 16,
            border: '1px solid #1c2740',
            background: '#0a0f1c',
          }}
        >
          <div style={{ fontSize: 48, fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>
            500
          </div>
          <div style={{ marginTop: 10, fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>
            DocuGraph hit a critical error
          </div>
          <p
            style={{
              margin: '8px auto 0',
              maxWidth: 340,
              fontSize: 14,
              lineHeight: 1.6,
              color: '#5b6b85',
            }}
          >
            The application couldn&apos;t recover from an unexpected error.
            Reloading usually fixes it.
          </p>
          <div style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={() => reset()}
              style={{
                padding: '10px 16px',
                borderRadius: 9,
                border: 'none',
                background: '#7c3aed',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Try again
            </button>
            <a
              href="/dashboard"
              style={{
                padding: '10px 16px',
                borderRadius: 9,
                border: '1px solid #283549',
                background: '#11192b',
                color: '#94a3b8',
                fontWeight: 600,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              Back to dashboard
            </a>
          </div>
          {error.digest && (
            <div
              style={{
                marginTop: 28,
                fontFamily: 'monospace',
                fontSize: 11.5,
                color: '#475569',
              }}
            >
              error id: {error.digest}
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
