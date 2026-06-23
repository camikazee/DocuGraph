'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { Loader } from '@/components/ui/Loader';
import { cn } from '@/lib/cn';
import { apiFetch } from '@/lib/api';
import { useProfile } from '@/lib/useProfile';

interface Stats {
  documents: number;
  edits: number;
  contributors: number;
  reads: number;
  avgReadTimeMs: number;
  activeWatchers: number;
  topDocuments: { filePath: string; title: string; edits: number; reads: number }[];
  mostWatched: { filePath: string; title: string; watchers: number }[];
  contributorsList: { name: string; edits: number }[];
  editsOverTime: { date: string; count: number }[];
}

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}
function fmtDuration(ms: number): string {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

const RANGES = [
  { key: '7d', days: 7 },
  { key: '30d', days: 30 },
  { key: '90d', days: 90 },
] as const;

export default function StatsPage() {
  const { profile, error } = useProfile();
  const ws = profile?.workspaces[0]?.id;
  const wsName = profile?.workspaces[0]?.name ?? 'this workspace';
  const [stats, setStats] = useState<Stats | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('30d');
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!ws) return;
    setLoadError(null);
    apiFetch<Stats>(`/workspaces/${ws}/documents/stats`)
      .then(setStats)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load statistics'));
  }, [ws]);

  useEffect(() => {
    load();
  }, [load]);

  const days = RANGES.find((r) => r.key === range)?.days ?? 30;
  const series = useMemo(() => {
    if (!stats) return [];
    const cutoff = Date.now() - days * 86400000;
    return stats.editsOverTime.filter((p) => +new Date(p.date) >= cutoff);
  }, [stats, days]);

  // realny trend: edycje w oknie vs poprzednie równe okno
  const { editsInRange, trend } = useMemo(() => {
    const all = stats?.editsOverTime ?? [];
    const now = Date.now();
    const cur = now - days * 86400000;
    const prev = now - 2 * days * 86400000;
    const sum = (from: number, to: number) =>
      all
        .filter((p) => {
          const t = +new Date(p.date);
          return t >= from && t < to;
        })
        .reduce((s, p) => s + p.count, 0);
    const inRange = sum(cur, now + 1);
    const before = sum(prev, cur);
    return {
      editsInRange: inRange,
      trend: before > 0 ? Math.round(((inRange - before) / before) * 100) : null,
    };
  }, [stats, days]);

  if (error) {
    return <main className="grid min-h-screen place-items-center text-fg2">{error}</main>;
  }

  const maxDocEdits = Math.max(1, ...(stats?.topDocuments ?? []).map((d) => d.edits));
  const maxContrib = Math.max(1, ...(stats?.contributorsList ?? []).map((c) => c.edits));
  const mostWatched = stats?.mostWatched ?? [];

  const cards = [
    { label: 'Total reads', value: stats ? String(stats.reads) : '…', trend: null, muted: false, sub: undefined as string | undefined },
    {
      label: `Edits · ${range}`,
      value: String(editsInRange),
      trend,
      muted: false,
      sub: undefined as string | undefined,
    },
    { label: 'Active watchers', value: stats ? String(stats.activeWatchers) : '…', trend: null, muted: false, sub: undefined },
    { label: 'Avg. read time', value: stats ? fmtDuration(stats.avgReadTimeMs) : '…', trend: null, muted: false, sub: undefined },
  ];

  return (
    <AppShell>
      <div className="mb-6 flex items-start gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-fg">Statistics</h1>
          <p className="mt-1 text-sm text-fg3">
            Activity across <span className="font-semibold text-fg2">{wsName}</span>
            {stats ? ` · ${stats.contributors} contributor${stats.contributors === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <div className="flex items-center gap-1 rounded-[9px] border border-line bg-card p-[3px]">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  'rounded-[7px] px-2.5 py-1 text-[12.5px] font-semibold transition',
                  range === r.key ? 'bg-acc text-white' : 'text-fg3 hover:text-fg2',
                )}
              >
                {r.key}
              </button>
            ))}
          </div>
          <ThemeSwitcher />
        </div>
      </div>

      <Loader loading={!stats && !loadError} error={loadError} onRetry={load} minHeight={420}>
        {/* stat cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="rounded-[14px] border border-line bg-card px-5 py-4">
              <div className="text-[12.5px] text-fg3">{c.label}</div>
              <div className="mt-2 flex items-end gap-2">
                <span className={cn('text-[26px] font-bold leading-none tracking-tight', c.muted ? 'text-fg3' : 'text-fg')}>
                  {c.value}
                </span>
                {c.trend !== null && (
                  <span
                    className={cn(
                      'mb-0.5 flex items-center gap-0.5 text-[12px] font-semibold',
                      c.trend >= 0 ? 'text-emerald-400' : 'text-red-400',
                    )}
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                      <path
                        d={c.trend >= 0 ? 'M8 12V4M4.5 7.5L8 4l3.5 3.5' : 'M8 4v8M4.5 8.5L8 12l3.5-3.5'}
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {Math.abs(c.trend)}%
                  </span>
                )}
              </div>
              {c.sub && <div className="mt-1 text-[11px] text-fg3">{c.sub}</div>}
            </div>
          ))}
        </div>

        {/* two columns: left (chart + top docs), right (contributors + watching) */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
          {/* LEFT */}
          <div className="grid gap-5">
            <div className="rounded-[14px] border border-line bg-card p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="text-[15px] font-semibold text-fg">Edits over time</span>
                <span className="ml-auto flex items-center gap-1.5 text-[12px] text-fg2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" /> Edits
                </span>
              </div>
              <EditsChart points={series} />
            </div>

            <div className="rounded-[14px] border border-line bg-card p-5">
              <div className="mb-4 flex items-center">
                <span className="text-[15px] font-semibold text-fg">Top documents</span>
                <span className="ml-auto text-[12px] text-fg3">by edits</span>
              </div>
              <div className="grid gap-3.5">
                {(stats?.topDocuments ?? []).map((d) => (
                  <Link key={d.filePath} href={`/documents/view?path=${encodeURIComponent(d.filePath)}`} className="block">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="truncate text-[13.5px] font-medium text-fg2">{d.title}</span>
                      <span className="ml-2 font-mono text-[12.5px] text-fg3">{d.edits} edit{d.edits === 1 ? '' : 's'}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-rowhover">
                      <div className="h-full rounded-full bg-acc" style={{ width: `${(d.edits / maxDocEdits) * 100}%` }} />
                    </div>
                  </Link>
                ))}
                {stats && stats.topDocuments.length === 0 && (
                  <p className="text-sm text-fg3">No edits recorded yet.</p>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="grid content-start gap-5">
            <div className="rounded-[14px] border border-line bg-card p-5">
              <div className="mb-4 text-[15px] font-semibold text-fg">Contributors</div>
              <div className="grid gap-3.5">
                {(stats?.contributorsList ?? []).map((c) => (
                  <div key={c.name}>
                    <div className="mb-1.5 flex items-center gap-2.5">
                      <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-gradient-to-br from-acc to-blue-500 text-[9px] font-semibold text-white">
                        {initials(c.name)}
                      </span>
                      <span className="flex-1 truncate text-[13px] text-fg2">{c.name}</span>
                      <span className="font-mono text-[12px] text-fg3">{c.edits} edit{c.edits === 1 ? '' : 's'}</span>
                    </div>
                    <div className="ml-[34px] h-1.5 overflow-hidden rounded-full bg-rowhover">
                      <div className="h-full rounded-full bg-acc" style={{ width: `${(c.edits / maxContrib) * 100}%` }} />
                    </div>
                  </div>
                ))}
                {stats && stats.contributorsList.length === 0 && (
                  <p className="text-sm text-fg3">No contributors yet.</p>
                )}
              </div>
            </div>

            {/* most watched (server-side, team-wide) */}
            <div className="rounded-[14px] border border-line bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="text-[15px] font-semibold text-fg">Most watched</span>
                <span className="rounded-full bg-capbg px-2 py-0.5 text-[11px] font-semibold text-fg3">
                  {mostWatched.length}
                </span>
              </div>
              {mostWatched.length === 0 ? (
                <p className="text-[12.5px] leading-relaxed text-fg3">
                  No documents are being watched yet.
                </p>
              ) : (
                <div className="grid gap-2.5">
                  {mostWatched.map((d) => (
                    <Link
                      key={d.filePath}
                      href={`/documents/view?path=${encodeURIComponent(d.filePath)}`}
                      className="flex items-center gap-2.5"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="var(--acc)" className="flex-none">
                        <path d="M8 1.8l1.8 3.8 4.1.5-3 2.8.8 4.1L8 11.9 4.3 13.8l.8-4.1-3-2.8 4.1-.5L8 1.8Z" stroke="var(--acc)" strokeWidth="1.1" strokeLinejoin="round" />
                      </svg>
                      <span className="flex-1 truncate text-[13px] text-fg2">{d.title}</span>
                      <span className="font-mono text-[12px] text-fg3">
                        {d.watchers} watcher{d.watchers === 1 ? '' : 's'}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs text-fg3">
          Reads, watchers and read time are tracked from real document views and
          follows; edit analytics from document revisions.
        </p>
      </Loader>
    </AppShell>
  );
}

function EditsChart({ points }: { points: { date: string; count: number }[] }) {
  const W = 900;
  const H = 220;
  const pad = 28;
  if (points.length === 0) {
    return (
      <div className="grid h-[220px] place-items-center text-sm text-fg3">No edits in this range.</div>
    );
  }
  const max = Math.max(1, ...points.map((p) => p.count));
  const n = points.length;
  const x = (i: number) => pad + (n === 1 ? (W - 2 * pad) / 2 : (i / (n - 1)) * (W - 2 * pad));
  const y = (c: number) => H - pad - (c / max) * (H - 2 * pad);
  const line = points.map((p, i) => `${x(i)},${y(p.count)}`).join(' ');
  const area = `${pad},${H - pad} ${line} ${x(n - 1)},${H - pad}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[220px] w-full">
      <polygon points={area} fill="var(--acc)" opacity="0.12" />
      <polyline points={line} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.count)} r="3.5" fill="#22c55e" />
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--fg3)">
            {p.date.slice(5)}
          </text>
        </g>
      ))}
    </svg>
  );
}
