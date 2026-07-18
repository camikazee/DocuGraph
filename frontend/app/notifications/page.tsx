'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Loader } from '@/components/ui/Loader';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { apiFetch } from '@/lib/api';
import { useProfile } from '@/lib/useProfile';
import { AppNotification, timeAgo, verbFor } from '@/lib/notifications';

type Filter = 'all' | 'unread';

function PrefToggle({
  on,
  onClick,
  title,
  subtitle,
}: {
  on: boolean | null;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={on === null}
      className="flex w-full items-center gap-3 rounded-[12px] border border-line bg-card px-4 py-3 text-left transition hover:border-acc disabled:opacity-60"
    >
      <span
        className={cn(
          'relative h-5 w-9 flex-none rounded-full transition',
          on ? 'bg-acc' : 'bg-inputbd',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition',
            on ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
      <span className="flex-1">
        <span className="block text-[13px] font-semibold text-fg">{title}</span>
        <span className="block text-[12px] text-fg3">{subtitle}</span>
      </span>
    </button>
  );
}

export default function NotificationsPage() {
  const { profile, error } = useProfile();
  const ws = profile?.workspaces[0]?.id;
  const router = useRouter();
  const { toast } = useToast();

  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [emailPref, setEmailPref] = useState<boolean | null>(null);
  const [digestPref, setDigestPref] = useState<boolean | null>(null);
  const [muted, setMuted] = useState<string[] | null>(null);

  useEffect(() => {
    apiFetch<{
      emailEnabled: boolean;
      digestEnabled: boolean;
      mutedKinds: string[];
    }>('/notification-preferences')
      .then((p) => {
        setEmailPref(p.emailEnabled);
        setDigestPref(p.digestEnabled);
        setMuted(p.mutedKinds);
      })
      .catch(() => {
        setEmailPref(false);
        setDigestPref(false);
        setMuted([]);
      });
  }, []);

  async function toggleKind(kind: string) {
    if (!muted) return;
    const next = muted.includes(kind)
      ? muted.filter((k) => k !== kind)
      : [...muted, kind];
    setMuted(next);
    try {
      await apiFetch('/notification-preferences', {
        method: 'PATCH',
        body: JSON.stringify({ mutedKinds: next }),
      });
    } catch {
      setMuted(muted);
      toast('Could not update preference', 'error');
    }
  }

  async function togglePref(
    key: 'emailEnabled' | 'digestEnabled',
    current: boolean | null,
    setter: (v: boolean) => void,
    onLabel: string,
    offLabel: string,
  ) {
    const next = !current;
    setter(next);
    try {
      await apiFetch('/notification-preferences', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: next }),
      });
      toast(next ? onLabel : offLabel, 'success');
    } catch {
      setter(!next);
      toast('Could not update preference', 'error');
    }
  }

  const PAGE = 30;
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    if (!ws) return;
    setItems(null);
    try {
      const unread = filter === 'unread' ? '&unread=1' : '';
      const list = await apiFetch<AppNotification[]>(
        `/workspaces/${ws}/documents/notifications?limit=${PAGE}${unread}`,
      );
      setItems(list);
      setHasMore(list.length === PAGE);
    } catch {
      setItems([]);
      setHasMore(false);
      toast('Could not load notifications', 'error');
    }
  }, [ws, filter, toast]);

  async function loadMore() {
    if (!ws || !items?.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const unread = filter === 'unread' ? '&unread=1' : '';
      const before = encodeURIComponent(items[items.length - 1].createdAt);
      const older = await apiFetch<AppNotification[]>(
        `/workspaces/${ws}/documents/notifications?limit=${PAGE}&before=${before}${unread}`,
      );
      setItems((prev) => [...(prev ?? []), ...older]);
      setHasMore(older.length === PAGE);
    } catch {
      toast('Could not load more', 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  const unreadCount = items?.filter((n) => !n.read).length ?? 0;

  async function openItem(n: AppNotification) {
    if (ws && !n.read) {
      try {
        await apiFetch(`/workspaces/${ws}/documents/notifications/${n.id}/read`, {
          method: 'POST',
        });
      } catch {
        /* navigation still proceeds */
      }
    }
    router.push(`/documents/view?path=${encodeURIComponent(n.filePath)}`);
  }

  async function markAll() {
    if (!ws) return;
    try {
      await apiFetch(`/workspaces/${ws}/documents/notifications/read-all`, {
        method: 'POST',
      });
      toast('All notifications marked as read', 'success');
      await load();
    } catch {
      toast('Could not mark all as read', 'error');
    }
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center text-fg2">{error}</main>
    );
  }

  const tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
  ];

  return (
    <AppShell>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Notifications</h1>
          <p className="mt-1 text-sm text-fg3">
            {items ? `${items.length} shown · ${unreadCount} unread` : 'Loading…'}
          </p>
        </div>
        <button
          onClick={markAll}
          disabled={!items || unreadCount === 0}
          className="rounded-lg border border-capbd bg-capbg px-3.5 py-2 text-[13px] font-semibold text-fg2 transition hover:border-acc disabled:opacity-50"
        >
          Mark all read
        </button>
      </div>

      <div className="mb-4 grid gap-2">
        <PrefToggle
          on={emailPref}
          onClick={() =>
            togglePref(
              'emailEnabled',
              emailPref,
              setEmailPref,
              'Instant email on',
              'Instant email off',
            )
          }
          title="Email me instantly"
          subtitle="Send an email as soon as a document you watch changes, moves, or gets a comment."
        />
        <PrefToggle
          on={digestPref}
          onClick={() =>
            togglePref(
              'digestEnabled',
              digestPref,
              setDigestPref,
              'Daily digest on',
              'Daily digest off',
            )
          }
          title="Daily digest"
          subtitle="Once a day, email a summary of your unread notifications."
        />
        <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-line bg-card px-4 py-3">
          <span className="mr-1 text-[13px] font-semibold text-fg">
            Notify me about
          </span>
          {[
            { k: 'changed', label: 'Changes' },
            { k: 'moved', label: 'Moves' },
            { k: 'comment', label: 'Comments' },
          ].map(({ k, label }) => {
            const on = muted !== null && !muted.includes(k);
            return (
              <button
                key={k}
                onClick={() => toggleKind(k)}
                disabled={muted === null}
                className={cn(
                  'rounded-full px-3 py-1 text-[12px] font-semibold transition disabled:opacity-60',
                  on
                    ? 'bg-acc text-white'
                    : 'border border-capbd bg-capbg text-fg3 line-through',
                )}
              >
                {label}
              </button>
            );
          })}
          <span className="text-[12px] text-fg3">· mentions always notify</span>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition',
              filter === t.key
                ? 'bg-acc text-white'
                : 'border border-capbd bg-capbg text-fg2 hover:border-acc',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Loader
        loading={!items}
        empty={items?.length === 0}
        emptyTitle={
          filter === 'unread' ? 'No unread notifications' : 'No notifications yet'
        }
        emptyMessage="You'll be notified here when a document you watch changes."
      >
        <div className="overflow-hidden rounded-[14px] border border-line bg-card">
          {items?.map((n, i) => (
            <button
              key={n.id}
              onClick={() => openItem(n)}
              className={cn(
                'flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-rowhover',
                i > 0 && 'border-t border-line/60',
              )}
            >
              <span
                className={cn(
                  'mt-1.5 h-2 w-2 flex-none rounded-full',
                  n.read ? 'bg-transparent' : 'bg-acc',
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-fg">
                  {n.title}
                </span>
                <span className="block truncate text-[13px] text-fg3">
                  {n.actor} {verbFor(n.kind)} <span className="font-mono">{n.filePath}</span>
                </span>
              </span>
              <span className="flex-none whitespace-nowrap text-[12px] text-muted">
                {timeAgo(n.createdAt)}
              </span>
            </button>
          ))}
        </div>
      </Loader>

      {hasMore && (
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
