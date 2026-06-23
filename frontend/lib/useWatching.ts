'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api';

/** Server-side „watching" (obserwowane dokumenty) dla aktualnego workspace. */
export function useWatching(ws?: string) {
  const [watching, setWatching] = useState<string[]>([]);

  const reload = useCallback(() => {
    if (!ws) return;
    apiFetch<string[]>(`/workspaces/${ws}/documents/watching`)
      .then(setWatching)
      .catch(() => setWatching([]));
  }, [ws]);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggle = useCallback(
    async (path: string, on: boolean) => {
      if (!ws) return;
      const next = await apiFetch<string[]>(`/workspaces/${ws}/documents/watch`, {
        method: 'POST',
        body: JSON.stringify({ path, on }),
      }).catch(() => null);
      if (next) setWatching(next);
    },
    [ws],
  );

  const isWatching = useCallback((p: string) => watching.includes(p), [watching]);

  return { watching, toggle, isWatching, reload };
}
