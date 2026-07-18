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

export default function NotificationsPage() {
  const { profile, error } = useProfile();
  const ws = profile?.workspaces[0]?.id;
  const router = useRouter();
  const { toast } = useToast();

  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [emailPref, setEmailPref] = useState<boolean | null>(null);

  useEffect(() => {
    apiFetch<{ emailEnabled: boolean }>('/notification-preferences')
      .then((p) => setEmailPref(p.emailEnabled))
      .catch(() => setEmailPref(false));
  }, []);

  async function toggleEmail() {
    const next = !emailPref;
    setEmailPref(next);
    try {
      await apiFetch('/notification-preferences', {
        method: 'PATCH',
        body: JSON.stringify({ emailEnabled: next }),
      });
      toast(
        next ? 'Email notifications on' : 'Email notifications off',
        'success',
      );
    } catch {
      setEmailPref(!next);
      toast('Could not update preference', 'error');
    }
  }

  const load = useCallback(async () => {
    if (!ws) return;
    setItems(null);
    try {
      const q = filter === 'unread' ? '?unread=1' : '';
      const list = await apiFetch<AppNotification[]>(
        `/workspaces/${ws}/documents/notifications${q}`,
      );
      setItems(list);
    } catch {
      setItems([]);
      toast('Could not load notifications', 'error');
    }
  }, [ws, filter, toast]);

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

      <button
        onClick={toggleEmail}
        disabled={emailPref === null}
        className="mb-4 flex w-full items-center gap-3 rounded-[12px] border border-line bg-card px-4 py-3 text-left transition hover:border-acc disabled:opacity-60"
      >
        <span
          className={cn(
            'relative h-5 w-9 flex-none rounded-full transition',
            emailPref ? 'bg-acc' : 'bg-inputbd',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white transition',
              emailPref ? 'left-[18px]' : 'left-0.5',
            )}
          />
        </span>
        <span className="flex-1">
          <span className="block text-[13px] font-semibold text-fg">
            Email me about watched documents
          </span>
          <span className="block text-[12px] text-fg3">
            Send an email when a document you watch changes, moves, or gets a comment.
          </span>
        </span>
      </button>

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
    </AppShell>
  );
}
