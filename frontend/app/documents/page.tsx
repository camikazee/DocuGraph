'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Loader } from '@/components/ui/Loader';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { apiFetch, ApiError } from '@/lib/api';
import { required } from '@/lib/validation';
import { useProfile } from '@/lib/useProfile';

interface DocItem {
  filePath: string;
  title: string;
  updatedAt: string;
  status: string | null;
  tags: string[];
  updatedBy: string | null;
  reads: number;
}
interface Member {
  userId: string;
  name: string;
}

type StatusKey = 'published' | 'draft' | 'review' | 'archived';

function statusStyle(key: StatusKey) {
  switch (key) {
    case 'published':
      return { label: 'Published', fg: '#10b981', bg: 'rgba(16,185,129,.12)', bd: 'rgba(16,185,129,.28)', dot: '#10b981' };
    case 'draft':
      return { label: 'Draft', fg: '#f59e0b', bg: 'rgba(245,158,11,.12)', bd: 'rgba(245,158,11,.28)', dot: '#f59e0b' };
    case 'review':
      return { label: 'In review', fg: 'var(--accfg)', bg: 'var(--accsoft)', bd: 'var(--capbd)', dot: 'var(--acc)' };
    default:
      return { label: 'Archived', fg: 'var(--fg3)', bg: 'transparent', bd: 'var(--capbd)', dot: 'var(--fg3)' };
  }
}

function normalizeStatus(s: string | null): StatusKey {
  if (s === 'draft' || s === 'review' || s === 'archived') return s;
  return 'published';
}

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

const FILTERS: { key: 'all' | StatusKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'review', label: 'In review' },
  { key: 'draft', label: 'Draft' },
];

export default function DocumentsPage() {
  const { profile, error } = useProfile();
  const { toast } = useToast();
  const router = useRouter();
  const ws = profile?.workspaces[0]?.id;

  const [docs, setDocs] = useState<DocItem[] | null>(null);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | StatusKey>('all');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Wstępny filtr tagu z URL (?tag=…) — bez useSearchParams, by uniknąć Suspense.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tag');
    if (t) setTagFilter(t);
  }, []);

  const [showForm, setShowForm] = useState(false);
  const [filePath, setFilePath] = useState('');
  const [content, setContent] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    filePath?: string | null;
    content?: string | null;
  }>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!ws) return;
    const [list, members] = await Promise.all([
      apiFetch<DocItem[]>(`/workspaces/${ws}/documents`),
      apiFetch<Member[]>(`/workspaces/${ws}/members`).catch(() => []),
    ]);
    setDocs(list);
    setOwners(Object.fromEntries(members.map((m) => [m.userId, m.name])));
  }, [ws]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (docs ?? []).filter((d) => {
      const st = normalizeStatus(d.status);
      return (
        (filter === 'all' || st === filter) &&
        (!tagFilter || (d.tags ?? []).includes(tagFilter)) &&
        (!q ||
          d.title.toLowerCase().includes(q) ||
          d.filePath.toLowerCase().includes(q))
      );
    });
  }, [docs, filter, search, tagFilter]);

  async function createDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!ws) return;
    const errs = { filePath: required(filePath), content: required(content) };
    setFieldErrors(errs);
    if (errs.filePath || errs.content) return;
    setSaving(true);
    try {
      await apiFetch(`/workspaces/${ws}/documents`, {
        method: 'POST',
        body: JSON.stringify({ file_path: filePath, content_raw: content }),
      });
      toast('Document saved', 'success');
      setShowForm(false);
      setFilePath('');
      setContent('');
      setFieldErrors({});
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center text-fg2">
        {error}
      </main>
    );
  }

  const published = (docs ?? []).filter((d) => normalizeStatus(d.status) === 'published').length;

  return (
    <AppShell>
      {/* header */}
      <div className="mb-6 flex items-start gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-fg">
            Documents
          </h1>
          <p className="mt-1 text-sm text-fg3">
            {docs
              ? `${docs.length} documents · ${published} published`
              : 'Loading…'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <Link
            href="/documents/structure"
            className="flex items-center gap-2 rounded-lg border border-capbd bg-capbg px-3.5 py-2 text-[13px] font-semibold text-fg2 transition hover:border-acc"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M1.6 4.4a1 1 0 0 1 1-1H6l1.4 1.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1V4.4Z" stroke="var(--accfg)" strokeWidth="1.2" />
            </svg>
            Structure
          </Link>
          <Button onClick={() => setShowForm((v) => !v)}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 3.5v9M3.5 8h9" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            New document
          </Button>
        </div>
      </div>

      {/* toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex max-w-[300px] flex-1 items-center gap-2 rounded-[9px] border border-inputbd bg-card px-3 py-2.5">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.2" stroke="var(--fg3)" strokeWidth="1.2" />
            <path d="M10.5 10.5L14 14" stroke="var(--fg3)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter documents…"
            className="flex-1 bg-transparent text-[13.5px] text-fg outline-none placeholder:text-fg3"
          />
        </div>
        <div className="flex items-center gap-[3px] rounded-[9px] border border-line bg-card p-[3px]">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-[7px] px-[11px] py-1.5 text-[12.5px] font-semibold transition',
                filter === f.key ? 'bg-acc text-white' : 'text-fg3 hover:text-fg2',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {tagFilter && (
          <button
            onClick={() => setTagFilter(null)}
            className="flex items-center gap-1.5 rounded-[9px] border border-acc bg-accsoft px-3 py-2 text-[12.5px] font-semibold text-accfg"
            title="Clear tag filter"
          >
            #{tagFilter}
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* create form */}
      {showForm && (
        <Card className="mb-4">
          <form onSubmit={createDoc} noValidate className="grid gap-4">
            <Input
              label="File path"
              value={filePath}
              onChange={setFilePath}
              placeholder="docs/guide.md"
              error={fieldErrors.filePath}
            />
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-fg3">Markdown</span>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                placeholder="# Title&#10;&#10;Content…"
                className={cn(
                  'rounded-[10px] border bg-card px-3.5 py-2.5 font-mono text-sm text-fg outline-none transition placeholder:text-fg3',
                  fieldErrors.content
                    ? 'border-red-500/60 focus:ring-2 focus:ring-red-500/30'
                    : 'border-inputbd focus:border-acc focus:ring-2 focus:ring-accsoft',
                )}
              />
              {fieldErrors.content && (
                <span className="text-xs text-red-400">{fieldErrors.content}</span>
              )}
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save document'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* table */}
      <div className="overflow-hidden rounded-[14px] border border-line bg-card">
        <div className="flex items-center border-b border-line bg-panel px-[18px] py-[11px] text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          <span className="flex-1">Document</span>
          <span className="w-[118px]">Status</span>
          <span className="w-[130px]">Owner</span>
          <span className="w-20 text-right">Reads</span>
          <span className="w-[104px] text-right">Updated</span>
        </div>

        <Loader
          loading={docs === null}
          empty={rows.length === 0}
          emptyTitle="No documents match"
          emptyMessage="Try a different search or status filter."
          minHeight={220}
        >
          {rows.map((d) => {
            const ss = statusStyle(normalizeStatus(d.status));
          const owner = d.updatedBy ? (owners[d.updatedBy] ?? 'Unknown') : 'CI';
          return (
            <button
              key={d.filePath}
              onClick={() =>
                router.push(
                  `/documents/view?path=${encodeURIComponent(d.filePath)}`,
                )
              }
              className="flex w-full items-center border-t border-line2 px-[18px] py-[13px] text-left transition hover:bg-rowhover"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-none">
                  <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5Z" stroke="var(--fg3)" strokeWidth="1.1" />
                  <path d="M9 1.6V4.5h3" stroke="var(--fg3)" strokeWidth="1.1" />
                </svg>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-fg">
                    {d.title}
                  </div>
                  <div className="truncate font-mono text-[11.5px] text-fg3">
                    {d.filePath}
                  </div>
                  {(d.tags ?? []).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.tags.slice(0, 5).map((t) => (
                        <span
                          key={t}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); setTagFilter(t); }}
                          className="rounded bg-panel px-1.5 py-0.5 text-[10.5px] text-fg3 transition hover:text-accfg"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <span className="w-[118px]">
                <span
                  className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-[3px] text-[11.5px] font-medium"
                  style={{ color: ss.fg, background: ss.bg, borderColor: ss.bd }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: ss.dot }} />
                  {ss.label}
                </span>
              </span>
              <span className="flex w-[130px] items-center gap-2">
                <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-gradient-to-br from-acc to-blue-500 text-[9px] font-semibold text-white">
                  {owner === 'CI' ? 'CI' : initials(owner)}
                </span>
                <span className="truncate text-[12.5px] text-fg2">{owner}</span>
              </span>
              <span className="w-20 text-right font-mono text-[13px] text-fg3">{d.reads ?? 0}</span>
              <span className="w-[104px] text-right text-[12.5px] text-fg3">
                {new Date(d.updatedAt).toLocaleDateString()}
              </span>
            </button>
          );
          })}
        </Loader>
      </div>
    </AppShell>
  );
}
