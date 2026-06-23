'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { cn } from '@/lib/cn';
import { apiFetch } from '@/lib/api';
import { useProfile } from '@/lib/useProfile';

interface Result {
  filePath: string;
  title: string;
  status: string | null;
  snippet: string;
  inTitle: boolean;
  inHeading: boolean;
}

type Facet = 'all' | 'documents' | 'headings';

function statusColor(s: string | null): string {
  if (s === 'draft') return '#f59e0b';
  if (s === 'review') return 'var(--acc)';
  if (s === 'archived') return 'var(--fg3)';
  return '#10b981';
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span className="font-semibold text-accfg">{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  );
}

function SearchContent() {
  const params = useSearchParams();
  const { profile, error } = useProfile();
  const ws = profile?.workspaces[0]?.id;
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [facet, setFacet] = useState<Facet>('all');

  useEffect(() => {
    if (!ws) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      apiFetch<Result[]>(`/workspaces/${ws}/documents/search?q=${encodeURIComponent(q)}`)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [ws, query]);

  const q = query.trim();
  const counts = useMemo(
    () => ({
      all: results.length,
      documents: results.filter((r) => r.inTitle).length,
      headings: results.filter((r) => r.inHeading).length,
    }),
    [results],
  );
  const shown = results.filter((r) =>
    facet === 'all' ? true : facet === 'documents' ? r.inTitle : r.inHeading,
  );
  const projects = new Set(
    results.map((r) => (r.filePath.includes('/') ? r.filePath.split('/')[0] : 'root')),
  ).size;

  if (error) {
    return <main className="grid min-h-screen place-items-center text-fg2">{error}</main>;
  }

  const FACETS: { key: Facet; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'documents', label: 'Documents', count: counts.documents },
    { key: 'headings', label: 'Headings', count: counts.headings },
  ];

  return (
    <AppShell>
      <h1 className="mb-4 text-[28px] font-bold tracking-tight text-fg">Search</h1>

      <div className="mb-4 flex items-center gap-2.5 rounded-[10px] border border-inputbd bg-card px-3.5 py-3">
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="4.4" stroke="var(--fg3)" strokeWidth="1.3" />
          <path d="M10.6 10.6L14 14" stroke="var(--fg3)" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search full text across your documents…"
          className="flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg3"
        />
        {loading && <span className="text-xs text-fg3">searching…</span>}
      </div>

      {q && (
        <div className="mb-4 flex items-center gap-4">
          <p className="text-[13px] text-fg3">
            <span className="font-semibold text-fg2">{results.length}</span> result
            {results.length === 1 ? '' : 's'} for <span className="text-fg2">&ldquo;{q}&rdquo;</span>
            {projects > 0 && <> · across {projects} section{projects === 1 ? '' : 's'}</>}
          </p>
          <div className="ml-auto flex items-center gap-1 rounded-[9px] border border-line bg-card p-[3px]">
            {FACETS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFacet(f.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12.5px] font-semibold transition',
                  facet === f.key ? 'bg-acc text-white' : 'text-fg3 hover:text-fg2',
                )}
              >
                {f.label}
                <span className={cn('text-[11px]', facet === f.key ? 'text-white/80' : 'text-fg3')}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className="grid gap-2">
        {shown.map((r) => (
          <li key={r.filePath}>
            <Link
              href={`/documents/view?path=${encodeURIComponent(r.filePath)}`}
              className="block rounded-xl border border-line bg-card px-4 py-3 transition hover:border-acc"
            >
              <div className="flex items-center gap-2.5">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-none">
                  <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5Z" stroke="var(--fg3)" strokeWidth="1.1" />
                </svg>
                <span className="font-medium text-fg">{highlight(r.title, q)}</span>
                <span className="ml-auto flex items-center gap-1.5 text-[11.5px] capitalize text-fg3">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor(r.status) }} />
                  {r.status ?? 'published'}
                </span>
              </div>
              <div className="mt-1 font-mono text-[11.5px] text-fg3">
                {r.filePath.split('/').map((seg, i, arr) => (
                  <span key={i}>
                    {seg}
                    {i < arr.length - 1 && <span className="text-muted"> / </span>}
                  </span>
                ))}
              </div>
              {r.snippet && (
                <p className="mt-1.5 line-clamp-2 text-[13px] text-fg3">{highlight(r.snippet, q)}</p>
              )}
            </Link>
          </li>
        ))}
        {q && !loading && shown.length === 0 && (
          <li className="text-sm text-fg3">No documents match &ldquo;{q}&rdquo;.</li>
        )}
        {!q && (
          <li className="text-sm text-fg3">Type to search across document titles and content.</li>
        )}
      </ul>
    </AppShell>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-10 text-fg3">Loading…</div>}>
      <SearchContent />
    </Suspense>
  );
}
