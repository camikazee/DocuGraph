'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Loader } from '@/components/ui/Loader';
import { apiFetch, ApiError } from '@/lib/api';
import { useProfile } from '@/lib/useProfile';
import { timeAgo } from '@/lib/notifications';
import { cn } from '@/lib/cn';

interface AuditEntry {
  id: string;
  action: string;
  target: string | null;
  actor: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  'member.joined': 'Member joined',
  'member.role_changed': 'Role changed',
  'member.removed': 'Member removed',
  'invitation.created': 'Invitation sent',
  'invitation.revoked': 'Invitation revoked',
  'apikey.created': 'API key created',
  'apikey.revoked': 'API key revoked',
  'source.configured': 'Repository configured',
  'documents.published': 'Published to Git',
  'document.moved': 'Document moved',
  'document.deleted': 'Document deleted',
};

// Kolor akcentu wg „wagi" zdarzenia (usunięcia/rewokacje na czerwono).
function toneFor(action: string): string {
  if (/removed|revoked|deleted/.test(action)) return 'bg-red-500';
  if (/created|joined|configured|published/.test(action)) return 'bg-emerald-500';
  return 'bg-acc';
}

export default function AuditPage() {
  const { profile, error } = useProfile();
  const ws = profile?.workspaces[0]?.id;

  const [items, setItems] = useState<AuditEntry[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE = 50;

  const load = useCallback(async () => {
    if (!ws) return;
    setItems(null);
    setForbidden(false);
    try {
      const list = await apiFetch<AuditEntry[]>(
        `/workspaces/${ws}/audit?limit=${PAGE}`,
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
      const older = await apiFetch<AuditEntry[]>(
        `/workspaces/${ws}/audit?limit=${PAGE}&before=${before}`,
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
      <h1 className="text-[28px] font-bold tracking-tight text-fg">Audit log</h1>
      <p className="mb-7 mt-1.5 text-sm text-fg3">
        Access and administrative events in this workspace.
      </p>

      {forbidden ? (
        <div className="rounded-[14px] border border-line bg-card px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-fg">Owners only</p>
          <p className="mt-1 text-[13px] text-fg3">
            The audit log is visible to workspace owners.
          </p>
        </div>
      ) : (
        <Loader
          loading={!items}
          empty={items?.length === 0}
          emptyTitle="No events yet"
          emptyMessage="Administrative actions will appear here as they happen."
        >
          <div className="overflow-hidden rounded-[14px] border border-line bg-card">
            {items?.map((e, i) => (
              <div
                key={e.id}
                className={cn(
                  'flex items-start gap-3 px-5 py-3.5',
                  i > 0 && 'border-t border-line/60',
                )}
              >
                <span
                  className={cn('mt-1.5 h-2 w-2 flex-none rounded-full', toneFor(e.action))}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-[14px] font-semibold text-fg">
                    {ACTION_LABELS[e.action] ?? e.action}
                  </span>
                  {e.target && (
                    <span className="ml-2 truncate font-mono text-[12px] text-fg3">
                      {e.target}
                    </span>
                  )}
                  <div className="text-[12px] text-fg3">
                    by <span className="text-fg2">{e.actor}</span>
                  </div>
                </div>
                <span className="flex-none whitespace-nowrap text-[12px] text-muted">
                  {timeAgo(e.createdAt)}
                </span>
              </div>
            ))}
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
