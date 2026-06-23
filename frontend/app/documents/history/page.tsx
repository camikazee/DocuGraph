'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogoMark } from '@/components/ui/Logo';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { apiFetch, ApiError } from '@/lib/api';
import { useProfile } from '@/lib/useProfile';

interface Revision {
  id: string;
  hash: string;
  title: string;
  message: string | null;
  createdAt: string;
  author: string;
  additions: number;
  deletions: number;
}
interface DiffLine {
  type: 'ctx' | 'add' | 'del';
  oldNo: number | null;
  newNo: number | null;
  text: string;
}
interface Diff {
  hash: string;
  filePath: string;
  title: string;
  message: string | null;
  author: string;
  createdAt: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

function relTime(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function HistoryContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const path = params.get('path') ?? '';
  const { profile, error } = useProfile();
  const ws = profile?.workspaces[0]?.id;

  const [revs, setRevs] = useState<Revision[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [mode, setMode] = useState<'split' | 'unified'>('split');
  const [restoring, setRestoring] = useState(false);

  const loadRevs = useCallback(async () => {
    if (!ws || !path) return;
    const r = await apiFetch<Revision[]>(
      `/workspaces/${ws}/documents/revisions?path=${encodeURIComponent(path)}`,
    );
    setRevs(r);
    setSelected((cur) => cur ?? r[0]?.id ?? null);
  }, [ws, path]);

  useEffect(() => {
    void loadRevs();
  }, [loadRevs]);

  useEffect(() => {
    if (!ws || !selected) return;
    apiFetch<Diff>(`/workspaces/${ws}/documents/diff/${selected}`)
      .then(setDiff)
      .catch(() => setDiff(null));
  }, [ws, selected]);

  async function restore() {
    if (!ws || !selected || !diff) return;
    const full = await apiFetch<{ contentRaw: string }>(
      `/workspaces/${ws}/documents/revision/${selected}`,
    ).catch(() => null);
    if (!full) return;
    setRestoring(true);
    try {
      await apiFetch(`/workspaces/${ws}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          file_path: diff.filePath,
          content_raw: full.contentRaw,
          message: `Restored version ${diff.hash}`,
        }),
      });
      toast('Version restored', 'success');
      setSelected(null);
      await loadRevs();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Restore failed', 'error');
    } finally {
      setRestoring(false);
    }
  }

  if (error) return <div className="p-10 text-fg2">{error}</div>;

  const contributors = new Set(revs.map((r) => r.author)).size;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg text-fg2">
      {/* LEFT — timeline */}
      <aside className="flex w-[300px] flex-none flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2.5 border-b border-line2 px-4 py-3.5">
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="grid h-7 w-7 place-items-center rounded-lg border border-line text-fg3 transition hover:bg-rowhover hover:text-fg2"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-none">
            <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5Z" stroke="var(--fg3)" strokeWidth="1.1" />
          </svg>
          <span className="truncate font-mono text-[12.5px] text-fg2">{path}</span>
        </div>
        <div className="px-5 pb-3 pt-4">
          <div className="text-lg font-bold tracking-tight text-fg">
            Version history
          </div>
          <div className="text-[12.5px] text-fg3">
            {revs.length} revisions · {contributors} contributor
            {contributors === 1 ? '' : 's'}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {revs.map((r) => {
            const active = selected === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={cn(
                  'mb-2 block w-full rounded-xl border px-3.5 py-3 text-left transition',
                  active
                    ? 'border-acc/60 bg-accsoft'
                    : 'border-line2 bg-card hover:border-line',
                )}
              >
                <div className="mb-1.5 text-[13.5px] font-semibold text-fg">
                  {r.message || r.title}
                </div>
                <div className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-acc to-blue-500 text-[8px] font-semibold text-white">
                    {initials(r.author)}
                  </span>
                  <span className="text-[12px] text-fg3">
                    {r.author} · {relTime(r.createdAt)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 font-mono text-[11px]">
                  <span className="text-fg3">{r.hash}</span>
                  <span className="text-emerald-400">+{r.additions}</span>
                  <span className="text-red-400">-{r.deletions}</span>
                </div>
              </button>
            );
          })}
          {revs.length === 0 && (
            <span className="px-2 text-[13px] text-fg3">No revisions yet.</span>
          )}
        </div>
      </aside>

      {/* RIGHT — diff */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-none items-center gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-fg">
              {diff ? diff.message || diff.title : '—'}
            </div>
            {diff && (
              <div className="text-[12px] text-fg3">
                {diff.author} committed {relTime(diff.createdAt)} ·{' '}
                <span className="font-mono">{diff.hash}</span>
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <div className="flex items-center gap-1 rounded-[9px] border border-line bg-card p-[3px]">
              {(['split', 'unified'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'rounded-[7px] px-2.5 py-1 text-[12px] font-semibold capitalize transition',
                    mode === m ? 'bg-acc text-white' : 'text-fg3 hover:text-fg2',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <ThemeSwitcher />
            <button
              onClick={restore}
              disabled={restoring || !diff}
              className="flex items-center gap-1.5 rounded-[9px] border border-capbd bg-capbg px-3 py-2 text-[12.5px] font-semibold text-fg2 transition hover:border-acc disabled:opacity-60"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M8 4v4l3 2M2.5 8a5.5 5.5 0 1 1 1.6 3.9" stroke="var(--accfg)" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              {restoring ? 'Restoring…' : 'Restore this version'}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {!diff && (
            <div className="p-10 text-fg3">Select a revision to see changes.</div>
          )}
          {diff && (
            <div>
              <div className="flex items-center gap-3 border-b border-line2 bg-panel px-5 py-2.5 font-mono text-[12px]">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5Z" stroke="var(--fg3)" strokeWidth="1.1" />
                </svg>
                <span className="text-fg2">{diff.filePath}</span>
                <span className="text-emerald-400">+{diff.additions}</span>
                <span className="text-red-400">-{diff.deletions}</span>
              </div>
              {mode === 'split' ? (
                <div className="font-mono text-[12.5px] leading-[20px]">
                  {diff.lines.map((l, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex',
                        l.type === 'add' && 'bg-emerald-500/10',
                        l.type === 'del' && 'bg-red-500/10',
                      )}
                    >
                      <span className="w-12 flex-none select-none px-2 text-right text-fg3">
                        {l.oldNo ?? ''}
                      </span>
                      <span className="w-12 flex-none select-none px-2 text-right text-fg3">
                        {l.newNo ?? ''}
                      </span>
                      <span
                        className={cn(
                          'flex-1 whitespace-pre px-3',
                          l.type === 'add' && 'text-emerald-300',
                          l.type === 'del' && 'text-red-300',
                          l.type === 'ctx' && 'text-fg2',
                        )}
                      >
                        {l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  '}
                        {l.text}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="font-mono text-[12.5px] leading-[20px]">
                  {diff.lines.map((l, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex',
                        l.type === 'add' && 'bg-emerald-500/10',
                        l.type === 'del' && 'bg-red-500/10',
                      )}
                    >
                      <span className="w-12 flex-none select-none px-2 text-right text-fg3">
                        {l.newNo ?? l.oldNo ?? ''}
                      </span>
                      <span
                        className={cn(
                          'flex-1 whitespace-pre px-3',
                          l.type === 'add' && 'text-emerald-300',
                          l.type === 'del' && 'text-red-300',
                          l.type === 'ctx' && 'text-fg2',
                        )}
                      >
                        {l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  '}
                        {l.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="p-10 text-fg3">Loading…</div>}>
      <HistoryContent />
    </Suspense>
  );
}
