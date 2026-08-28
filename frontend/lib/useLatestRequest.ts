import { useCallback, useEffect, useMemo, useRef } from 'react';

export function useLatestRequest(): {
  nextSignal: () => AbortSignal;
  abort: () => void;
} {
  const active = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    active.current?.abort();
    active.current = null;
  }, []);

  const nextSignal = useCallback(() => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    return controller.signal;
  }, []);

  useEffect(() => abort, [abort]);

  return useMemo(() => ({ nextSignal, abort }), [nextSignal, abort]);
}
