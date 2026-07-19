'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { apiFetch, ApiError } from '@/lib/api';

interface ShareLink {
  id: string;
  createdAt: string;
  expiresAt: string | null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Owner/editor tworzy publiczny link tylko-do-odczytu do bieżącego pliku.
 * URL pokazujemy raz przy utworzeniu (jak token CI) — potem tylko metadane
 * i możliwość odwołania.
 */
export function ShareDialog({
  ws,
  filePath,
  onClose,
}: {
  ws: string;
  filePath: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expiry, setExpiry] = useState('never');
  const [freshUrl, setFreshUrl] = useState<string | null>(null);

  const q = `path=${encodeURIComponent(filePath)}`;

  const fail = useCallback(
    (err: unknown) =>
      toast(err instanceof ApiError ? err.message : 'Something went wrong', 'error'),
    [toast],
  );

  const load = useCallback(async () => {
    try {
      setLinks(
        await apiFetch<ShareLink[]>(
          `/workspaces/${ws}/documents/share-links?${q}`,
        ),
      );
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [ws, q, fail]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setCreating(true);
    try {
      const body: { path: string; expiresInDays?: number } = { path: filePath };
      if (expiry !== 'never') body.expiresInDays = Number(expiry);
      const res = await apiFetch<{ url: string }>(
        `/workspaces/${ws}/documents/share-links`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      setFreshUrl(res.url);
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setCreating(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard?.writeText(url);
      toast('Link copied', 'success');
    } catch {
      toast('Copy failed — select and copy manually', 'error');
    }
  }

  async function revoke(id: string) {
    if (!window.confirm('Revoke this link? Anyone holding it loses access.'))
      return;
    try {
      setLinks(
        await apiFetch<ShareLink[]>(
          `/workspaces/${ws}/documents/share-links/${id}?${q}`,
          { method: 'DELETE' },
        ),
      );
      toast('Link revoked', 'success');
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative flex h-full w-[420px] max-w-full flex-col overflow-y-auto border-l border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-fg">Public share</h2>
            <p className="mt-0.5 truncate font-mono text-[12px] text-fg3">
              {filePath}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-fg3 transition hover:bg-rowhover hover:text-fg2"
            aria-label="Close"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-6 p-5">
          <p className="text-[13px] text-fg3">
            Anyone with the link can read this one document — no account needed.
            Links are read-only and revocable.
          </p>

          {/* create */}
          <div className="grid gap-3">
            <label className="grid gap-1 text-[12.5px] text-fg3">
              Expires
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="h-[40px] rounded-[10px] border border-inputbd bg-card px-2 text-sm text-fg2"
              >
                <option value="never">Never</option>
                <option value="7">In 7 days</option>
                <option value="30">In 30 days</option>
                <option value="90">In 90 days</option>
              </select>
            </label>
            <Button onClick={create} disabled={creating} className="h-[40px]">
              {creating ? 'Creating…' : 'Create link'}
            </Button>
          </div>

          {freshUrl && (
            <div className="grid gap-2 rounded-[10px] border border-acc bg-accsoft p-3">
              <span className="text-[12px] font-semibold text-accfg">
                Copy it now — the full link is shown only once.
              </span>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={freshUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-lg border border-inputbd bg-card px-2 py-1.5 font-mono text-[12px] text-fg2"
                />
                <button
                  onClick={() => copy(freshUrl)}
                  className="flex-none rounded-lg border border-capbd bg-capbg px-3 py-1.5 text-[12.5px] font-semibold text-fg2 transition hover:border-acc"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* existing */}
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
              Active links
            </div>
            {loading ? (
              <p className="text-[13px] text-fg3">Loading…</p>
            ) : links.length === 0 ? (
              <p className="text-[13px] text-fg3">No public links yet.</p>
            ) : (
              <div className="grid gap-1.5">
                {links.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-2 rounded-lg border border-line2 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1 text-[12.5px] text-fg2">
                      Created {fmtDate(l.createdAt)}
                      <span className="text-fg3">
                        {l.expiresAt
                          ? ` · expires ${fmtDate(l.expiresAt)}`
                          : ' · no expiry'}
                      </span>
                    </div>
                    <button
                      onClick={() => revoke(l.id)}
                      className="flex-none text-[12px] text-fg3 transition hover:text-red-400"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
