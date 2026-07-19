'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { apiFetch, ApiError } from '@/lib/api';
import { useProfile } from '@/lib/useProfile';

interface GraphNode {
  filePath: string;
  title: string;
}
interface Edge {
  from: string;
  to: string;
}
interface Graph {
  nodes: GraphNode[];
  edges: Edge[];
}
interface BrokenLink {
  from: string;
  to: string;
  line: number;
  suggestion: string | null;
}
interface DocItem {
  filePath: string;
  updatedAt: string;
}

type Cat = 'linked' | 'stale' | 'broken' | 'orphan';
type Filter = 'all' | 'linked' | 'stale' | 'broken' | 'orphans';

const W = 760;
const H = 520;
const STALE_DAYS = 90;

const CAT_COLOR: Record<Cat, string> = {
  linked: 'var(--acc)',
  stale: '#f59e0b',
  broken: '#ef4444',
  orphan: 'var(--fg3)',
};

export default function GraphPage() {
  const { profile, error } = useProfile();
  const { toast } = useToast();
  const router = useRouter();
  const ws = profile?.workspaces[0]?.id;

  const [graph, setGraph] = useState<Graph | null>(null);
  const [broken, setBroken] = useState<BrokenLink[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Record<string, string>>({});
  const [hover, setHover] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const [seed, setSeed] = useState(0);
  const [fixing, setFixing] = useState(false);

  const load = useCallback(async () => {
    if (!ws) return;
    const [g, b, docs] = await Promise.all([
      apiFetch<Graph>(`/workspaces/${ws}/documents/graph`),
      apiFetch<BrokenLink[]>(`/workspaces/${ws}/documents/broken-links`).catch(() => []),
      apiFetch<DocItem[]>(`/workspaces/${ws}/documents`).catch(() => []),
    ]);
    setGraph(g);
    setBroken(b);
    setUpdatedAt(Object.fromEntries(docs.map((d) => [d.filePath, d.updatedAt])));
  }, [ws]);

  useEffect(() => {
    void load();
  }, [load]);

  async function fixOne(link: BrokenLink) {
    if (!ws || !link.suggestion) return;
    setFixing(true);
    try {
      await apiFetch(`/workspaces/${ws}/documents/broken-links/fix`, {
        method: 'POST',
        body: JSON.stringify({ from: link.from, to: link.to }),
      });
      toast(`Re-pointed to ${link.suggestion}`, 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Fix failed', 'error');
    } finally {
      setFixing(false);
    }
  }

  async function fixAll() {
    if (!ws) return;
    if (!broken.some((b) => b.suggestion)) return;
    setFixing(true);
    try {
      const res = await apiFetch<{ fixedCount: number; skippedCount: number }>(
        `/workspaces/${ws}/documents/broken-links/fix-all`,
        { method: 'POST' },
      );
      const msg = res.skippedCount
        ? `Fixed ${res.fixedCount} link(s) · ${res.skippedCount} need manual fix`
        : `Fixed ${res.fixedCount} link(s)`;
      toast(msg, res.fixedCount ? 'success' : 'info');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Auto-fix failed', 'error');
    } finally {
      setFixing(false);
    }
  }

  const model = useMemo(() => {
    if (!graph) return null;
    const degree: Record<string, number> = {};
    graph.edges.forEach((e) => {
      degree[e.from] = (degree[e.from] ?? 0) + 1;
      degree[e.to] = (degree[e.to] ?? 0) + 1;
    });
    const brokenFrom = new Set(broken.map((b) => b.from));
    const staleCut = Date.now() - STALE_DAYS * 86400000;
    const isStale = (fp: string) => {
      const u = updatedAt[fp];
      return !!u && +new Date(u) < staleCut;
    };
    const catOf = (fp: string): Cat => {
      if (brokenFrom.has(fp)) return 'broken';
      if (isStale(fp)) return 'stale';
      return (degree[fp] ?? 0) > 0 ? 'linked' : 'orphan';
    };

    // circular layout with seed-based jitter
    const n = graph.nodes.length || 1;
    const cx = W / 2;
    const cy = H / 2;
    const r = Math.min(W, H) / 2 - 70;
    const pos: Record<string, { x: number; y: number }> = {};
    graph.nodes.forEach((node, i) => {
      const jitter = (((i * 9301 + seed * 49297) % 233280) / 233280) * 0.7 - 0.35;
      const a = (2 * Math.PI * i) / n - Math.PI / 2 + (seed ? jitter : 0);
      const rr = seed ? r * (0.82 + (((i * 131 + seed * 71) % 100) / 100) * 0.18) : r;
      pos[node.filePath] = n === 1 ? { x: cx, y: cy } : { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) };
    });

    const counts = {
      all: graph.nodes.length,
      linked: graph.nodes.filter((nd) => (degree[nd.filePath] ?? 0) > 0).length,
      stale: graph.nodes.filter((nd) => isStale(nd.filePath)).length,
      broken: brokenFrom.size,
      orphans: graph.nodes.filter((nd) => !(degree[nd.filePath] ?? 0)).length,
    };
    return { degree, brokenFrom, isStale, catOf, pos, counts };
  }, [graph, broken, updatedAt, seed]);

  if (error) {
    return <main className="grid min-h-screen place-items-center text-fg2">{error}</main>;
  }

  const matchesFilter = (fp: string): boolean => {
    if (!model) return true;
    switch (filter) {
      case 'all':
        return true;
      case 'linked':
        return (model.degree[fp] ?? 0) > 0;
      case 'stale':
        return model.isStale(fp);
      case 'broken':
        return model.brokenFrom.has(fp);
      case 'orphans':
        return !(model.degree[fp] ?? 0);
    }
  };
  const q = query.trim().toLowerCase();
  const matchesSearch = (nd: GraphNode) =>
    !q || nd.title.toLowerCase().includes(q) || nd.filePath.toLowerCase().includes(q);

  const counts = model?.counts ?? { all: 0, linked: 0, stale: 0, broken: 0, orphans: 0 };
  const FILTERS: { key: Filter; label: string; count: number; color?: string }[] = [
    { key: 'all', label: 'All nodes', count: counts.all },
    { key: 'linked', label: 'Linked', count: counts.linked, color: CAT_COLOR.linked },
    { key: 'stale', label: 'Stale', count: counts.stale, color: CAT_COLOR.stale },
    { key: 'broken', label: 'Broken', count: counts.broken, color: CAT_COLOR.broken },
    { key: 'orphans', label: 'Orphans', count: counts.orphans, color: CAT_COLOR.orphan },
  ];
  const LEGEND: { label: string; color: string }[] = [
    { label: 'Linked document', color: CAT_COLOR.linked },
    { label: 'Stale (>90 days)', color: CAT_COLOR.stale },
    { label: 'Broken link', color: CAT_COLOR.broken },
    { label: 'Orphan (no links)', color: CAT_COLOR.orphan },
  ];
  const vb = `${(W - W / zoom) / 2} ${(H - H / zoom) / 2} ${W / zoom} ${H / zoom}`;

  // --- Perf: viewport culling (virtualization) + label culling for big graphs.
  const CULL_MARGIN = 60;
  const LABEL_LIMIT = 140; // powyżej tylu widocznych węzłów etykiety tylko dla hubów/hover/wyszukania
  const HUB_DEG = 6;
  const vx0 = (W - W / zoom) / 2;
  const vy0 = (H - H / zoom) / 2;
  const vw = W / zoom;
  const vh = H / zoom;
  const inView = (p: { x: number; y: number }) =>
    p.x >= vx0 - CULL_MARGIN &&
    p.x <= vx0 + vw + CULL_MARGIN &&
    p.y >= vy0 - CULL_MARGIN &&
    p.y <= vy0 + vh + CULL_MARGIN;
  const visibleCount =
    graph && model
      ? graph.nodes.reduce((c, nd) => {
          const p = model.pos[nd.filePath];
          return c + (p && inView(p) ? 1 : 0);
        }, 0)
      : 0;
  const showAllLabels = visibleCount <= LABEL_LIMIT;
  const totalNodes = graph?.nodes.length ?? 0;

  return (
    <AppShell>
      <div className="mb-5 flex items-center gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-fg">Document graph</h1>
          <p className="mt-1 text-sm text-fg3">Documents linked through internal Markdown references.</p>
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-[9px] border border-line bg-card px-3 py-2">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.4" stroke="var(--fg3)" strokeWidth="1.3" />
            <path d="M10.6 10.6L14 14" stroke="var(--fg3)" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes…"
            className="w-[180px] bg-transparent text-[13px] text-fg outline-none placeholder:text-muted"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[180px_1fr_220px]">
        {/* FILTER + LEGEND */}
        <aside className="grid content-start gap-5">
          <div>
            <div className="mb-2 px-1 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted">Filter</div>
            <div className="grid gap-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition',
                    filter === f.key ? 'bg-accsoft text-fg' : 'text-fg2 hover:bg-rowhover',
                  )}
                >
                  {f.color ? (
                    <span className="h-2 w-2 flex-none rounded-full" style={{ background: f.color }} />
                  ) : (
                    <span className="h-2 w-2 flex-none rounded-full border border-fg3" />
                  )}
                  <span className="flex-1 text-left">{f.label}</span>
                  <span className="font-mono text-[11.5px] text-fg3">{f.count}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 px-1 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted">Legend</div>
            <div className="grid gap-2 px-1">
              {LEGEND.map((l) => (
                <div key={l.label} className="flex items-center gap-2.5 text-[12px] text-fg3">
                  <span className="h-2 w-2 flex-none rounded-full" style={{ background: l.color }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* GRAPH */}
        <div className="relative overflow-hidden rounded-[14px] border border-line bg-card">
          {graph && graph.nodes.length > 0 ? (
            <svg viewBox={vb} className="h-[520px] w-full">
              {graph.edges.map((e, i) => {
                const a = model?.pos[e.from];
                const b = model?.pos[e.to];
                if (!a || !b) return null;
                if (!inView(a) && !inView(b)) return null; // poza kadrem
                const lit = hover === e.from || hover === e.to;
                const dim = !matchesFilter(e.from) && !matchesFilter(e.to);
                const isBroken = model?.brokenFrom.has(e.from);
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={isBroken ? '#ef4444' : lit ? 'var(--acc)' : 'var(--line)'}
                    strokeWidth={lit ? 1.6 : 1}
                    opacity={dim ? 0.15 : 1}
                  />
                );
              })}
              {graph.nodes.map((nd) => {
                const p = model?.pos[nd.filePath];
                if (!p) return null;
                if (!inView(p)) return null; // wirtualizacja: pomiń poza kadrem
                const cat = model?.catOf(nd.filePath) ?? 'orphan';
                const deg = model?.degree[nd.filePath] ?? 0;
                const isHover = hover === nd.filePath;
                const dim = !matchesFilter(nd.filePath) || !matchesSearch(nd);
                const hit = !!q && matchesSearch(nd);
                const showLabel =
                  showAllLabels || isHover || hit || deg >= HUB_DEG;
                return (
                  <g
                    key={nd.filePath}
                    transform={`translate(${p.x},${p.y})`}
                    className="cursor-pointer"
                    opacity={dim ? 0.18 : 1}
                    onMouseEnter={() => setHover(nd.filePath)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => router.push(`/documents/view?path=${encodeURIComponent(nd.filePath)}`)}
                  >
                    <circle
                      r={isHover || hit ? 11 : deg ? 8 : 6}
                      fill={CAT_COLOR[cat]}
                      stroke={hit ? 'var(--fg)' : isHover ? '#fff' : 'rgba(255,255,255,.25)'}
                      strokeWidth={hit ? 2 : 1.4}
                    />
                    {showLabel && (
                      <text
                        y={-15}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight={isHover || hit ? 600 : 400}
                        fill={isHover || hit ? 'var(--fg)' : 'var(--fg3)'}
                      >
                        {nd.title}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className="grid h-[520px] place-items-center px-6 text-center">
              {graph ? (
                <div className="flex max-w-[320px] flex-col items-center gap-2">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-capbg">
                    <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                      <path d="M5.5 6l5 4M4 5.5a2 2 0 1 0 0-.1M12 4.5a1.5 1.5 0 1 0 0-.1M11 12a1.5 1.5 0 1 0 0-.1" stroke="var(--fg3)" strokeWidth="1.2" />
                    </svg>
                  </span>
                  <div className="text-[13.5px] font-semibold text-fg">
                    Nothing to graph yet
                  </div>
                  <p className="text-[12.5px] leading-relaxed text-fg3">
                    The graph draws itself from links between your documents.
                    Add a few docs that reference each other to see it come alive.
                  </p>
                  <Link
                    href="/documents"
                    className="mt-2 rounded-[9px] bg-acc px-[15px] py-[9px] text-[13px] font-semibold text-white transition hover:opacity-90"
                  >
                    Go to documents
                  </Link>
                </div>
              ) : (
                <span className="text-sm text-fg3">Loading…</span>
              )}
            </div>
          )}

          {/* virtualization notice — never silently drop nodes */}
          {graph &&
            graph.nodes.length > 0 &&
            (visibleCount < totalNodes || !showAllLabels) && (
              <div className="absolute left-3 top-3 rounded-lg border border-capbd bg-capbg/90 px-2.5 py-1 text-[11.5px] font-medium text-fg3 backdrop-blur">
                {visibleCount < totalNodes
                  ? `Showing ${visibleCount} of ${totalNodes} nodes`
                  : `${totalNodes} nodes`}
                {!showAllLabels && ' · labels on hubs, hover & search'}
              </div>
            )}

          {/* re-run layout (bottom-left) */}
          <button
            onClick={() => setSeed((s) => s + 1)}
            className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg border border-capbd bg-capbg px-3 py-1.5 text-[12px] font-semibold text-fg2 transition hover:border-acc"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5V5h-2.5" stroke="var(--accfg)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Re-run layout
          </button>

          {/* zoom (bottom-right) */}
          <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-lg border border-capbd bg-capbg">
            <button
              onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.2).toFixed(2)))}
              className="px-2.5 py-1.5 text-fg2 transition hover:bg-rowhover"
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))}
              className="border-t border-capbd px-2.5 py-1.5 text-fg2 transition hover:bg-rowhover"
              aria-label="Zoom out"
            >
              −
            </button>
          </div>
        </div>

        {/* GRAPH OVERVIEW */}
        <aside className="grid content-start gap-3">
          <div className="rounded-[14px] border border-line bg-card p-1.5">
            <div className="px-3 py-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted">Graph overview</div>
            {[
              { label: 'Documents', value: counts.all },
              { label: 'Links', value: graph?.edges.length ?? 0 },
              { label: 'Stale documents', value: counts.stale },
              { label: 'Broken links', value: broken.length },
              { label: 'Orphans', value: counts.orphans },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between px-3 py-2 text-[13px]">
                <span className="text-fg2">{s.label}</span>
                <span className="font-mono font-semibold text-fg">{s.value}</span>
              </div>
            ))}
          </div>
          <div className="rounded-[12px] border border-blue-500/25 bg-blue-500/10 p-3 text-[12px] leading-relaxed text-blue-300 [border-left:3px_solid_#3b82f6]">
            Click a node to open its document. Hover to highlight its links; use the
            filters to isolate stale, broken or orphan nodes.
          </div>
        </aside>
      </div>

      {broken.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-[14px] border border-line bg-card">
          <div className="flex items-center gap-3 border-b border-line2 px-5 py-4">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5L15 13.5H1L8 1.5Z" stroke="#ef4444" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M8 6.5v3.2M8 11.5v.1" stroke="#ef4444" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="text-[15px] font-semibold text-fg">Broken links</span>
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">
              {broken.length} found
            </span>
            <button
              onClick={fixAll}
              disabled={fixing || !broken.some((b) => b.suggestion)}
              className="ml-auto rounded-lg bg-acc px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              Auto-fix all
            </button>
          </div>
          <div className="grid gap-2 p-4">
            {broken.map((b, i) => (
              <div key={i} className="flex items-center gap-3 rounded-[10px] border border-line2 bg-panel px-4 py-3">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="flex-none">
                  <path d="M6.5 9.5L9.5 6.5M6 5L5 6a2.5 2.5 0 0 0 3.5 3.5M10 11l1-1a2.5 2.5 0 0 0-3.5-3.5" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[13px]">
                    <span className="text-fg2">{b.from}</span>
                    <span className="text-fg3"> → </span>
                    <span className="text-red-400">{b.to}</span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-fg3">
                    line {b.line} ·{' '}
                    {b.suggestion ? (
                      <>suggested <span className="text-emerald-400">{b.suggestion}</span></>
                    ) : (
                      'no matching document'
                    )}
                  </div>
                </div>
                {b.suggestion ? (
                  <button
                    onClick={() => fixOne(b)}
                    disabled={fixing}
                    className="flex-none rounded-lg bg-accsoft px-3 py-1.5 text-[12.5px] font-semibold text-accfg transition hover:opacity-90 disabled:opacity-50"
                  >
                    Fix
                  </button>
                ) : (
                  <Link
                    href={`/documents/edit?path=${encodeURIComponent(b.from)}`}
                    className="flex-none rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-medium text-fg2 transition hover:bg-rowhover"
                  >
                    Locate
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
