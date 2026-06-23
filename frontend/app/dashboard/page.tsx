'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { useToast } from '@/components/ui/Toast';
import { Loader } from '@/components/ui/Loader';
import { apiFetch } from '@/lib/api';
import { useProfile } from '@/lib/useProfile';
import { useWatching } from '@/lib/useWatching';

interface DocItem {
  filePath: string;
  title: string;
  updatedAt: string;
  status: string | null;
  updatedBy: string | null;
}
interface Member {
  userId: string;
  name: string;
  avatarUrl: string | null;
}
interface Graph {
  nodes: { filePath: string }[];
  edges: { from: string; to: string }[];
}
interface Stats {
  edits: number;
  contributors: number;
  reads: number;
  editsOverTime: { date: string; count: number }[];
}

const STALE_DAYS = 30;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}
function rel(iso: string): string {
  const m = Math.round((Date.now() - +new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function Avatar({ name, url, size = 26 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    return (
      <span
        className="flex-none rounded-full bg-cover bg-center"
        style={{ width: size, height: size, backgroundImage: `url(${url})` }}
        aria-label={name}
      />
    );
  }
  return (
    <span
      className="grid flex-none place-items-center rounded-full bg-gradient-to-br from-acc to-blue-500 font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const w = 116;
  const h = 30;
  if (data.length === 0) {
    return <svg width={w} height={h} />;
  }
  const max = Math.max(...data, 1);
  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const pt = (v: number, i: number) =>
    `${(i * step).toFixed(1)},${(h - (v / max) * (h - 6) - 3).toFixed(1)}`;
  const line = data.map(pt).join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polygon points={area} fill="var(--accsoft)" />
      <polyline
        points={data.length > 1 ? line : `0,${pt(data[0], 0).split(',')[1]} ${w},${pt(data[0], 0).split(',')[1]}`}
        fill="none"
        stroke="var(--acc)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill={filled ? 'var(--acc)' : 'none'}>
    <path
      d="M8 1.8l1.8 3.8 4.1.5-3 2.8.8 4.1L8 11.9 4.3 13.8l.8-4.1-3-2.8 4.1-.5L8 1.8Z"
      stroke={filled ? 'var(--acc)' : 'var(--fg3)'}
      strokeWidth="1.1"
      strokeLinejoin="round"
    />
  </svg>
);

export default function DashboardPage() {
  const { profile, error } = useProfile();
  const { toast } = useToast();
  const ws = profile?.workspaces[0]?.id;

  const [docs, setDocs] = useState<DocItem[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] });
  const [brokenCount, setBrokenCount] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { watching, toggle } = useWatching(ws);

  const toggleWatch = (filePath: string) =>
    toggle(filePath, !watching.includes(filePath));

  const load = useCallback(async () => {
    if (!ws) return;
    setLoadError(null);
    try {
      const [list, mem, g, broken, st] = await Promise.all([
        apiFetch<DocItem[]>(`/workspaces/${ws}/documents`),
        apiFetch<Member[]>(`/workspaces/${ws}/members`).catch(() => []),
        apiFetch<Graph>(`/workspaces/${ws}/documents/graph`).catch(() => ({ nodes: [], edges: [] })),
        apiFetch<unknown[]>(`/workspaces/${ws}/documents/broken-links`).catch(() => []),
        apiFetch<Stats>(`/workspaces/${ws}/documents/stats`).catch(() => null),
      ]);
      setDocs(list);
      setMembers(mem);
      setGraph(g);
      setBrokenCount(broken.length);
      setStats(st);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load dashboard');
      setDocs([]);
    }
  }, [ws]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <main className="grid min-h-screen place-items-center text-fg2">{error}</main>;
  }
  if (!profile) {
    return <main className="grid min-h-screen place-items-center text-fg3">Loading…</main>;
  }

  const firstName = profile.user.name.split(' ')[0];
  const list = docs ?? [];
  const nameOf = (id: string | null) =>
    id ? members.find((m) => m.userId === id)?.name ?? 'Someone' : 'CI';
  const avatarOf = (id: string | null) =>
    id ? members.find((m) => m.userId === id)?.avatarUrl ?? null : null;

  // --- Needs attention (real) ---
  const staleCutoff = Date.now() - STALE_DAYS * 86400_000;
  const stale = list.filter((d) => +new Date(d.updatedAt) < staleCutoff).length;
  const edges = graph.edges ?? [];
  const nodes = graph.nodes ?? [];
  const linked = new Set<string>();
  edges.forEach((e) => {
    linked.add(e.from);
    linked.add(e.to);
  });
  const orphans = nodes.filter((n) => !linked.has(n.filePath)).length;
  const issues = stale + brokenCount + orphans;

  const attention = [
    { key: 'stale', count: stale, label: 'Stale documents', sub: `Not edited in ${STALE_DAYS}+ days`, href: '/documents' },
    { key: 'broken', count: brokenCount, label: 'Broken links', sub: 'Targets missing or moved', href: '/graph' },
    { key: 'orphans', count: orphans, label: 'Orphan files', sub: 'No incoming or outgoing links', href: '/graph' },
  ];

  const recent = [...list]
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .slice(0, 6);
  const watchedDocs = watching
    .map((p) => list.find((d) => d.filePath === p))
    .filter((d): d is DocItem => !!d);
  const spark = (stats?.editsOverTime ?? []).map((e) => e.count);

  return (
    <AppShell>
      {/* header */}
      <div className="mb-6 flex items-start gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-fg">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 flex items-center gap-2.5 text-sm text-fg3">
            <span>
              {profile.workspaces.length} project{profile.workspaces.length === 1 ? '' : 's'} · last synced just now
            </span>
            {issues > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11.5px] font-semibold text-red-400">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="#ef4444" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                {issues} item{issues === 1 ? '' : 's'}
              </span>
            )}
          </p>
        </div>
      </div>

      <Loader loading={docs === null} error={loadError} onRetry={load} minHeight={400}>
        {/* needs attention */}
        <div className="mb-[18px] overflow-hidden rounded-[14px] border border-line bg-card">
          <div className="flex items-center gap-2.5 border-b border-line2 px-5 py-[14px]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.8l6.2 11a.7.7 0 0 1-.6 1H2.4a.7.7 0 0 1-.6-1l6.2-11Z" stroke="#f59e0b" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M8 6.5v3M8 11.4v.1" stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="text-[15px] font-semibold text-fg">Needs attention</span>
            {issues > 0 && (
              <span className="rounded-full bg-capbg px-2 py-0.5 text-[11px] font-semibold text-fg3">
                {issues} items
              </span>
            )}
            <button
              onClick={async () => {
                await load();
                toast(`Health check complete · ${issues} issue${issues === 1 ? '' : 's'}`, issues ? 'info' : 'success');
              }}
              className="ml-auto rounded-lg border border-capbd bg-capbg px-3 py-1.5 text-[12.5px] font-semibold text-fg2 transition hover:border-acc"
            >
              Run health check
            </button>
          </div>
          <div className="grid grid-cols-3">
            {attention.map((a) => (
              <Link
                key={a.key}
                href={a.href}
                className="border-r border-line2 px-5 py-4 transition last:border-r-0 hover:bg-rowhover"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke={a.count ? '#ef4444' : 'var(--fg3)'} strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                  <span className="text-2xl font-bold leading-none text-fg">{a.count}</span>
                </div>
                <div className="text-[13px] font-semibold text-fg2">{a.label}</div>
                <div className="text-xs text-fg3">{a.sub}</div>
              </Link>
            ))}
          </div>
        </div>

        {/* project cards */}
        <div className="mb-[18px] grid grid-cols-1 gap-[18px] sm:grid-cols-2">
          {profile.workspaces.map((w) => {
            const isCurrent = w.id === ws;
            return (
              <div key={w.id} className="rounded-[14px] border border-line bg-card px-5 py-[18px]">
                <div className="flex items-center gap-[11px]">
                  <div className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-gradient-to-br from-acc to-blue-500 text-[13px] font-bold text-white">
                    {w.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[14.5px] font-semibold text-fg">{w.name}</div>
                    <div className="text-xs text-fg3">
                      {(() => {
                        if (!isCurrent) return '— docs · — contributors';
                        const docs = list.length;
                        const contrib = stats?.contributors ?? members.length;
                        return `${docs} doc${docs === 1 ? '' : 's'} · ${contrib} contributor${contrib === 1 ? '' : 's'}`;
                      })()}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-[3px] text-[11.5px] font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Synced
                  </span>
                </div>
                <div className="mt-4 flex items-end gap-[22px]">
                  <div>
                    <div className="text-[11px] text-fg3">Reads</div>
                    <div className="font-mono text-[15px] font-semibold text-fg2">
                      {isCurrent ? stats?.reads ?? '—' : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-fg3">Edits</div>
                    <div className="font-mono text-[15px] font-semibold text-fg2">
                      {isCurrent ? stats?.edits ?? '—' : '—'}
                    </div>
                  </div>
                  <div className="ml-auto">{isCurrent && <Sparkline data={spark} />}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* recent activity + watching */}
        <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.4fr_1fr]">
          {/* recent activity */}
          <div className="rounded-[14px] border border-line bg-card px-5 py-[18px]">
            <div className="mb-3 text-[15px] font-semibold text-fg">Recent activity</div>
            {recent.length === 0 && <p className="text-sm text-fg3">No activity yet.</p>}
            <div className="grid">
              {recent.map((d) => {
                const watched = watching.includes(d.filePath);
                return (
                  <div
                    key={d.filePath}
                    className="flex items-center gap-3 border-t border-line2 py-2.5 first:border-t-0"
                  >
                    <Avatar name={nameOf(d.updatedBy)} url={avatarOf(d.updatedBy)} />
                    <Link
                      href={`/documents/view?path=${encodeURIComponent(d.filePath)}`}
                      className="min-w-0 flex-1"
                    >
                      <div className="truncate text-[13px] text-fg2">
                        <span className="font-semibold text-fg">{nameOf(d.updatedBy)}</span>{' '}
                        <span className="text-fg3">updated</span> {d.title}
                      </div>
                      <div className="truncate font-mono text-[11px] text-fg3">{d.filePath}</div>
                    </Link>
                    <span className="whitespace-nowrap text-[11px] text-fg3">{rel(d.updatedAt)}</span>
                    <button
                      onClick={() => toggleWatch(d.filePath)}
                      className="grid h-7 w-7 flex-none place-items-center rounded-md transition hover:bg-rowhover"
                      aria-label={watched ? 'Unwatch' : 'Watch'}
                      title={watched ? 'Watching — click to unwatch' : 'Watch this document'}
                    >
                      <StarIcon filled={watched} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* watching */}
          <div className="rounded-[14px] border border-line bg-card px-5 py-[18px]">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[15px] font-semibold text-fg">Watching</span>
              <span className="rounded-full bg-capbg px-2 py-0.5 text-[11px] font-semibold text-fg3">
                {watchedDocs.length}
              </span>
            </div>
            {watchedDocs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <StarIcon filled={false} />
                <p className="max-w-[220px] text-[12.5px] leading-relaxed text-fg3">
                  Star a document in Recent activity to keep an eye on it here.
                </p>
              </div>
            ) : (
              <div className="grid">
                {watchedDocs.map((d) => (
                  <div
                    key={d.filePath}
                    className="flex items-center gap-2.5 border-t border-line2 py-2.5 first:border-t-0"
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-none">
                      <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5Z" stroke="var(--fg3)" strokeWidth="1.1" />
                    </svg>
                    <Link
                      href={`/documents/view?path=${encodeURIComponent(d.filePath)}`}
                      className="min-w-0 flex-1"
                    >
                      <div className="truncate text-[13px] font-medium text-fg2">{d.title}</div>
                      <div className="truncate font-mono text-[11px] text-fg3">{d.filePath}</div>
                    </Link>
                    <span className="whitespace-nowrap rounded-md bg-accsoft px-1.5 py-0.5 text-[10px] font-semibold text-accfg">
                      {rel(d.updatedAt)}
                    </span>
                    <button
                      onClick={() => toggleWatch(d.filePath)}
                      className="grid h-7 w-7 flex-none place-items-center rounded-md transition hover:bg-rowhover"
                      aria-label="Unwatch"
                      title="Unwatch"
                    >
                      <StarIcon filled />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Loader>
    </AppShell>
  );
}
