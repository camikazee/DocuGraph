'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setToken } from '@/lib/auth';

/** Zezwól tylko na wewnętrzne ścieżki (bez open-redirect na obce hosty). */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/dashboard';
}

/**
 * Lądowanie po OAuth: backend przekierowuje tu z tokenem w fragmencie URL
 * (`#token=…&next=…`). Zapisujemy token i wracamy tam, gdzie user zmierzał.
 */
export default function OAuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const frag = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = frag.get('token');
    if (token) {
      setToken(token);
      router.replace(safeNext(frag.get('next')));
    } else {
      router.replace('/login?error=oauth');
    }
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-bg text-sm text-fg3">
      Signing you in…
    </main>
  );
}
