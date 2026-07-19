'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Loader } from '@/components/ui/Loader';
import { apiFetch, ApiError } from '@/lib/api';
import { useProfile } from '@/lib/useProfile';
import { timeAgo } from '@/lib/notifications';
import { cn } from '@/lib/cn';

interface ErrorEntry {
  id: string;
  source: 'server' | 'client';
  message: string;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  requestId: string | null;
  user: string | null;
  createdAt: string;
}

export default function ErrorsPage() {
  const { profile, error } = useProfile();
  const ws = profile?.workspaces[0]?.id;

  const [items, setItems] = useState<ErrorEntry[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE = 50;

  const load = useCallback(async () => {
    if (!ws) return;
    setItems(null);
    setForbidden(false);
    try {
      const list = await apiFetch<ErrorEntry[]>(
        `/workspaces/${ws}/errors?limit=${PAGE}`,
      );
      setItems(list);
      setHasMore(list.length === PAGE);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      setItems([]);
      setHasMore(false);
    }
  }, [ws]);

  async function loadMore() {
    if (!ws || !items?.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const before = encodeURIComponent(items[items.length - 1].createdAt);
      const older = await apiFetch<ErrorEntry[]>(
        `/workspaces/${ws}/errors?limit=${PAGE}&before=${before}`,
      );
      setItems((prev) => [...(prev ?? []), ...older]);
      setHasMore(older.length === PAGE);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center text-fg2">{error}</main>
    );
  }

  return (
    <AppShell>
      <h1 className="text-[28px] font-bold tracking-tight text-fg">Error log</h1>
      <p className="mb-7 mt-1.5 text-sm text-fg3">
        Server errors (5xx) and client-side crashes captured locally — no
        third-party service. Stack traces are kept on the server, not shown here.
      </p>

      {forbidden ? (
        <div className="rounded-[14px] border border-line bg-card px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-fg">Owners only</p>
          <p className="mt-1 text-[13px] text-fg3">
            The error log is visible to workspace owners.
          </p>
        </div>
      ) : (
        <Loader
          loading={!items}
          empty={items?.length === 0}
          emptyTitle="No errors logged"
          emptyMessage="When something breaks, it shows up here so you can act on it."
        >
          <div className="overflow-x-auto rounded-[14px] border border-line bg-card">
            <div className="min-w-[640px]">
              {items?.map((e, i) => (
                <div
                  key={e.id}
                  className={cn(
                    'flex items-start gap-3 px-5 py-3.5',
                    i > 0 && 'border-t border-line/60',
                  )}
                >
                  <span
                    className={cn(
                      'mt-[3px] flex-none rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                      e.source === 'server'
                        ? 'bg-red-500/15 text-red-400'
                        : 'bg-amber-500/15 text-amber-400',
                    )}
                  >
                    {e.source}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-fg">
                      {e.message}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-fg3">
                      {e.statusCode && (
                        <span className="font-mono text-red-400">
                          {e.statusCode}
                        </span>
                      )}
                      {(e.method || e.path) && (
                        <span className="truncate font-mono">
                          {e.method ? `${e.method} ` : ''}
                          {e.path}
                        </span>
                      )}
                      {e.user && (
                        <span>
                          · <span className="text-fg2">{e.user}</span>
                        </span>
                      )}
                      {e.requestId && (
                        <span className="font-mono text-muted">
                          · rid {e.requestId.slice(0, 8)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="flex-none whitespace-nowrap text-[12px] text-muted">
                    {timeAgo(e.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Loader>
      )}

      {!forbidden && hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-lg border border-capbd bg-capbg px-4 py-2 text-[13px] font-semibold text-fg2 transition hover:border-acc disabled:opacity-60"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </AppShell>
  );
}
