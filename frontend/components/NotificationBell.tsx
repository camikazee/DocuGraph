'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useProfile } from '@/lib/useProfile';
import { AppNotification, timeAgo, verbFor } from '@/lib/notifications';

export function NotificationBell() {
  const { profile } = useProfile();
  const ws = profile?.workspaces[0]?.id;
  const router = useRouter();

  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    if (!ws) return;
    try {
      const { unread } = await apiFetch<{ unread: number }>(
        `/workspaces/${ws}/documents/notifications/count`,
      );
      setUnread(unread);
    } catch {
      /* silent — bell just shows stale count */
    }
  }, [ws]);

  // Poll the unread count: on mount, on workspace change, and every 30s.
  useEffect(() => {
    if (!ws) return;
    refreshCount();
    const t = setInterval(refreshCount, 30_000);
    return () => clearInterval(t);
  }, [ws, refreshCount]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        !panelRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.top, left: r.right + 10 });
    setOpen(true);
    setItems(null);
    if (!ws) return;
    try {
      const list = await apiFetch<AppNotification[]>(
        `/workspaces/${ws}/documents/notifications`,
      );
      setItems(list);
    } catch {
      setItems([]);
    }
  }

  async function openItem(n: AppNotification) {
    setOpen(false);
    if (ws && !n.read) {
      try {
        const { unread } = await apiFetch<{ unread: number }>(
          `/workspaces/${ws}/documents/notifications/${n.id}/read`,
          { method: 'POST' },
        );
        setUnread(unread);
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
      setUnread(0);
      setItems((prev) => prev?.map((n) => ({ ...n, read: true })) ?? prev);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        aria-label={unread ? `Notifications (${unread} unread)` : 'Notifications'}
        className="relative flex items-center gap-2.5 rounded-[9px] border border-line bg-card px-3 py-2 text-left text-[13px] text-fg3 transition hover:border-acc"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-none">
          <path
            d="M8 2.2a3.4 3.4 0 0 0-3.4 3.4c0 3.2-1 4.2-1 4.2h8.8s-1-1-1-4.2A3.4 3.4 0 0 0 8 2.2ZM6.7 12.2a1.4 1.4 0 0 0 2.6 0"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="flex-1">Notifications</span>
        {unread > 0 && (
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-acc px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[60] max-h-[70vh] w-[340px] overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-[13px] font-semibold text-fg">Notifications</span>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="text-[12px] font-medium text-acc hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items === null ? (
              <p className="px-4 py-6 text-center text-[13px] text-fg3">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-fg3">
                You&apos;re all caught up.
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className="flex w-full items-start gap-2.5 border-b border-line/60 px-4 py-3 text-left transition hover:bg-rowhover"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 flex-none rounded-full ${
                      n.read ? 'bg-transparent' : 'bg-acc'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-fg">
                      {n.title}
                    </span>
                    <span className="block truncate text-[12px] text-fg3">
                      {n.actor} {verbFor(n.kind)}{' '}
                      <span className="font-mono">{n.filePath}</span>
                    </span>
                    <span className="text-[11px] text-muted">
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
          <button
            onClick={() => {
              setOpen(false);
              router.push('/notifications');
            }}
            className="w-full border-t border-line px-4 py-2.5 text-center text-[12px] font-medium text-acc transition hover:bg-rowhover"
          >
            See all notifications
          </button>
        </div>
      )}
    </>
  );
}
