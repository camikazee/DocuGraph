'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Loader } from '@/components/ui/Loader';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { apiFetch, ApiError, apiBaseUrl } from '@/lib/api';
import { getToken } from '@/lib/auth';
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
  health?: { broken: boolean; orphan: boolean; stale: boolean };
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
  const [attention, setAttention] = useState(false);

  const role = profile?.workspaces[0]?.role;
  const canEdit = role === 'owner' || role === 'editor';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  function toggleSel(path: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }

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
  const [exporting, setExporting] = useState(false);

  // Download the workspace docs: single HTML file, multi-page static site (ZIP),
  // or the raw Markdown source (ZIP, folder structure preserved).
  const exportDocs = useCallback(
    async (kind: 'html' | 'zip' | 'source') => {
      if (!ws || exporting) return;
      const spec = {
        html: { path: 'export.html', file: 'documentation.html' },
        zip: { path: 'export.zip', file: 'documentation.zip' },
        source: { path: 'export/source.zip', file: 'documentation-source.zip' },
      }[kind];
      setExporting(true);
      try {
        const res = await fetch(
          `${apiBaseUrl}/workspaces/${ws}/documents/${spec.path}`,
          { headers: { Authorization: `Bearer ${getToken() ?? ''}` } },
        );
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = spec.file;
        a.click();
        URL.revokeObjectURL(url);
        toast('Documentation exported', 'success');
      } catch {
        toast('Export failed', 'error');
      } finally {
        setExporting(false);
      }
    },
    [ws, exporting, toast],
  );

  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Import a picked folder: upload each .md preserving the tree (top folder
  // stripped), reusing the create endpoint.
  async function importFolder(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((f) =>
      f.name.toLowerCase().endsWith('.md'),
    );
    e.target.value = '';
    if (!ws || files.length === 0) return;
    setImporting(true);
    let ok = 0;
    try {
      for (const f of files) {
        const rel = (f as File & { webkitRelativePath?: string })
          .webkitRelativePath;
        const filePath = rel
          ? rel.split('/').slice(1).join('/') || f.name
          : f.name;
        try {
          await apiFetch(`/workspaces/${ws}/documents`, {
            method: 'POST',
            body: JSON.stringify({
              file_path: filePath,
              content_raw: await f.text(),
            }),
          });
          ok++;
        } catch {
          /* skip invalid path */
        }
      }
      toast(`Imported ${ok} of ${files.length} file(s)`, ok ? 'success' : 'error');
      await load();
    } finally {
      setImporting(false);
    }
  }

  // Import a .zip of a .md tree via the backend importer.
  async function importZip(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!ws || !file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(
        `${apiBaseUrl}/workspaces/${ws}/documents/import.zip`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken() ?? ''}` },
          body: fd,
        },
      );
      if (!res.ok) throw new Error(String(res.status));
      const { imported, skipped } = (await res.json()) as {
        imported: number;
        skipped: number;
      };
      toast(
        `Imported ${imported} file(s)${skipped ? ` · ${skipped} skipped` : ''}`,
        'success',
      );
      await load();
    } catch {
      toast('Import failed', 'error');
    } finally {
      setImporting(false);
    }
  }

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
      const h = d.health;
      const needsAttn = !!h && (h.broken || h.orphan || h.stale);
      return (
        (filter === 'all' || st === filter) &&
        (!tagFilter || (d.tags ?? []).includes(tagFilter)) &&
        (!attention || needsAttn) &&
        (!q ||
          d.title.toLowerCase().includes(q) ||
          d.filePath.toLowerCase().includes(q))
      );
    });
  }, [docs, filter, search, tagFilter, attention]);

  // Rozróżnij „pusty workspace" (onboarding) od „filtr nic nie znalazł".
  const firstRun = (docs?.length ?? 0) === 0;

  const allVisibleSelected =
    rows.length > 0 && rows.every((d) => selected.has(d.filePath));
  function toggleAll() {
    setSelected((s) => {
      const n = new Set(s);
      if (rows.every((d) => n.has(d.filePath)))
        rows.forEach((d) => n.delete(d.filePath));
      else rows.forEach((d) => n.add(d.filePath));
      return n;
    });
  }

  async function runBulk(
    op: 'addTag' | 'removeTag' | 'move' | 'delete',
    extra: { tag?: string; toFolder?: string } = {},
  ) {
    if (!ws || selected.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await apiFetch<{ ok: number; failed: number }>(
        `/workspaces/${ws}/documents/bulk`,
        {
          method: 'POST',
          body: JSON.stringify({ op, paths: [...selected], ...extra }),
        },
      );
      toast(
        `${res.ok} updated${res.failed ? ` · ${res.failed} failed` : ''}`,
        res.failed ? 'error' : 'success',
      );
      setSelected(new Set());
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Bulk action failed', 'error');
    } finally {
      setBulkBusy(false);
    }
  }
  function bulkAddTag() {
    const t = window.prompt('Add tag to selected documents:')?.trim();
    if (t) void runBulk('addTag', { tag: t });
  }
  function bulkMove() {
    const f = window.prompt('Move selected into folder (blank = root):');
    if (f !== null) void runBulk('move', { toFolder: f.trim() });
  }
  function bulkDelete() {
    if (window.confirm(`Delete ${selected.size} document(s)? This cannot be undone.`))
      void runBulk('delete');
  }

  async function publishVersion() {
    if (!ws) return;
    const label = window.prompt(
      'Publish a version — snapshot the current docs under a label (e.g. v2.1):',
    )?.trim();
    if (!label) return;
    try {
      const res = await apiFetch<{ label: string; docCount: number }>(
        `/workspaces/${ws}/document-versions`,
        { method: 'POST', body: JSON.stringify({ label }) },
      );
      toast(`Published ${res.label} (${res.docCount} docs)`, 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Publish failed', 'error');
    }
  }

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
      <div className="mb-6 flex flex-wrap items-start gap-4">
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
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <div className="flex items-center overflow-hidden rounded-lg border border-capbd bg-capbg">
            <button
              onClick={() => exportDocs('html')}
              disabled={exporting}
              className="flex items-center gap-2 px-3.5 py-2 text-[13px] font-semibold text-fg2 transition hover:text-fg disabled:opacity-60"
              title="Download all docs as a single static HTML file"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M8 2.5v7M5 7l3 3 3-3M3 13h10" stroke="var(--accfg)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {exporting ? 'Exporting…' : 'Export'}
            </button>
            <button
              onClick={() => exportDocs('zip')}
              disabled={exporting}
              className="border-l border-capbd px-3 py-2 text-[13px] font-semibold text-fg3 transition hover:text-fg disabled:opacity-60"
              title="Download as a multi-page static site (ZIP)"
            >
              Site .zip
            </button>
            <button
              onClick={() => exportDocs('source')}
              disabled={exporting}
              className="border-l border-capbd px-3 py-2 text-[13px] font-semibold text-fg3 transition hover:text-fg disabled:opacity-60"
              title="Download the raw Markdown source as a ZIP (folder structure preserved)"
            >
              Source .zip
            </button>
          </div>

          {/* import: folder or .zip */}
          <div className="flex items-center overflow-hidden rounded-lg border border-capbd bg-capbg">
            <button
              onClick={() => folderInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2 px-3.5 py-2 text-[13px] font-semibold text-fg2 transition hover:text-fg disabled:opacity-60"
              title="Upload a folder from disk — mirrors the whole tree"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M8 13.5v-7M5 9l3-3 3 3M2.5 3.5h4L8 5h5.5a1 1 0 0 1 1 1V12" stroke="var(--accfg)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {importing ? 'Importing…' : 'Import folder'}
            </button>
            <button
              onClick={() => zipInputRef.current?.click()}
              disabled={importing}
              className="border-l border-capbd px-3 py-2 text-[13px] font-semibold text-fg3 transition hover:text-fg disabled:opacity-60"
              title="Import a .zip of a Markdown tree"
            >
              .zip
            </button>
          </div>
          {/* hidden inputs for folder + zip import */}
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-expect-error non-standard directory-picker attributes
            webkitdirectory=""
            directory=""
            className="hidden"
            onChange={importFolder}
          />
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={importZip}
          />

          <Link
            href="/documents/structure"
            className="flex items-center gap-2 rounded-lg border border-capbd bg-capbg px-3.5 py-2 text-[13px] font-semibold text-fg2 transition hover:border-acc"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M1.6 4.4a1 1 0 0 1 1-1H6l1.4 1.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1V4.4Z" stroke="var(--accfg)" strokeWidth="1.2" />
            </svg>
            Structure
          </Link>
          {canEdit && (
            <button
              onClick={publishVersion}
              title="Snapshot the current docs as a named version"
              className="flex items-center gap-2 rounded-lg border border-capbd bg-capbg px-3.5 py-2 text-[13px] font-semibold text-fg2 transition hover:border-acc"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M3 2.5h10v11l-5-3-5 3v-11Z" stroke="var(--accfg)" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              Publish version
            </button>
          )}
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
        {(() => {
          const n = (docs ?? []).filter(
            (d) => d.health && (d.health.broken || d.health.orphan || d.health.stale),
          ).length;
          if (!n) return null;
          return (
            <button
              onClick={() => setAttention((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 rounded-[9px] border px-3 py-2 text-[12.5px] font-semibold transition',
                attention
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-400'
                  : 'border-line bg-card text-fg3 hover:text-fg2',
              )}
              title="Documents that may need attention"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5 14.5 13H1.5L8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M8 6v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Needs attention {n}
            </button>
          );
        })()}
      </div>

      {/* bulk action bar */}
      {canEdit && selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[12px] border border-acc bg-accsoft px-4 py-2.5">
          <span className="text-[13px] font-semibold text-accfg">
            {selected.size} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            {(
              [
                ['Add tag', bulkAddTag],
                ['Move to…', bulkMove],
              ] as const
            ).map(([label, fn]) => (
              <button
                key={label}
                onClick={fn}
                disabled={bulkBusy}
                className="rounded-lg border border-capbd bg-card px-3 py-1.5 text-[12.5px] font-semibold text-fg2 transition hover:border-acc disabled:opacity-60"
              >
                {label}
              </button>
            ))}
            <button
              onClick={bulkDelete}
              disabled={bulkBusy}
              className="rounded-lg border border-red-500/35 px-3 py-1.5 text-[12.5px] font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-60"
            >
              Delete
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-fg3 transition hover:text-fg2"
            >
              Clear
            </button>
          </div>
        </div>
      )}

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

      {/* table (scrolls horizontally on narrow screens) */}
      <div className="overflow-x-auto rounded-[14px] border border-line bg-card">
        <div className="min-w-[720px]">
        <div className="flex items-center border-b border-line bg-panel px-[18px] py-[11px] text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          {canEdit && (
            <span className="flex w-6 items-center">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAll}
                aria-label="Select all"
                className="h-4 w-4 accent-[var(--acc)]"
              />
            </span>
          )}
          <span className="flex-1">Document</span>
          <span className="w-[118px]">Status</span>
          <span className="w-[130px]">Owner</span>
          <span className="w-20 text-right">Reads</span>
          <span className="w-[104px] text-right">Updated</span>
        </div>

        <Loader
          loading={docs === null}
          empty={rows.length === 0}
          emptyTitle={
            firstRun ? 'Your workspace is empty' : 'No documents match'
          }
          emptyMessage={
            firstRun
              ? 'Add your first Markdown doc, import a folder or a .zip, or connect a Git repository to sync docs automatically.'
              : 'Try a different search or status filter.'
          }
          emptyAction={
            firstRun ? (
              <>
                <Button
                  onClick={() => {
                    setShowForm(true);
                    setAttention(false);
                    setTagFilter(null);
                    setFilter('all');
                    setSearch('');
                  }}
                >
                  New document
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => folderInputRef.current?.click()}
                >
                  Import folder
                </Button>
                <Button variant="secondary" href="/connect">
                  Connect a repo
                </Button>
              </>
            ) : undefined
          }
          minHeight={220}
        >
          {rows.map((d) => {
            const ss = statusStyle(normalizeStatus(d.status));
          const owner = d.updatedBy ? (owners[d.updatedBy] ?? 'Unknown') : 'CI';
          return (
            <div
              key={d.filePath}
              className="flex items-center border-t border-line2 px-[18px] transition hover:bg-rowhover"
            >
              {canEdit && (
                <span className="flex w-6 items-center">
                  <input
                    type="checkbox"
                    checked={selected.has(d.filePath)}
                    onChange={() => toggleSel(d.filePath)}
                    aria-label={`Select ${d.title}`}
                    className="h-4 w-4 accent-[var(--acc)]"
                  />
                </span>
              )}
            <button
              onClick={() =>
                router.push(
                  `/documents/view?path=${encodeURIComponent(d.filePath)}`,
                )
              }
              className="flex flex-1 items-center py-[13px] text-left"
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
                          aria-label={`Filter by tag ${t}`}
                          onClick={(e) => { e.stopPropagation(); setTagFilter(t); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              setTagFilter(t);
                            }
                          }}
                          className="rounded bg-panel px-1.5 py-0.5 text-[10.5px] text-fg3 transition hover:text-accfg"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                  {d.health && (d.health.broken || d.health.orphan || d.health.stale) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.health.broken && (
                        <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">broken links</span>
                      )}
                      {d.health.orphan && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">orphan</span>
                      )}
                      {d.health.stale && (
                        <span className="rounded bg-rowhover px-1.5 py-0.5 text-[10px] font-medium text-fg3">stale</span>
                      )}
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
            </div>
          );
          })}
        </Loader>
        </div>
      </div>
    </AppShell>
  );
}
