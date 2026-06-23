'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LogoMark } from '@/components/ui/Logo';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { apiFetch, ApiError } from '@/lib/api';
import { useProfile } from '@/lib/useProfile';

interface DocItem {
  filePath: string;
  title: string;
  size: number;
}
interface Graph {
  edges: { from: string; to: string }[];
}

const TEMPLATES = [
  {
    key: 'api',
    name: 'API Endpoint',
    desc: 'Request / response reference',
    badges: ['GET', 'POST'],
    body: '---\ntitle: New Endpoint\n---\n\n# `GET /resource`\n\nDescribe the endpoint.\n\n## Request\n\n| Param | Type | Description |\n| --- | --- | --- |\n\n## Response\n\n```json\n{}\n```\n',
  },
  {
    key: 'guide',
    name: 'Feature Guide',
    desc: 'Intro, steps & examples',
    body: '---\ntitle: New Guide\n---\n\n# Overview\n\nWhat this feature does.\n\n## Steps\n\n1. First\n2. Second\n\n## Example\n\n```ts\n// ...\n```\n',
  },
  {
    key: 'changelog',
    name: 'Changelog / Release',
    desc: 'Versioned release notes',
    body: '---\ntitle: Changelog\n---\n\n# Changelog\n\n## [Unreleased]\n\n### Added\n\n- \n\n### Fixed\n\n- \n',
  },
];

const fmtSize = (b: number) => (b < 1024 ? `${b} B` : `${Math.round(b / 1024)} KB`);

const DragDots = ({ accent }: { accent?: boolean }) => (
  <svg width="12" height="13" viewBox="0 0 16 16" fill="none" className="flex-none">
    {[3.5, 8, 12.5].map((cy) =>
      [6, 10].map((cx) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1" fill={accent ? 'var(--accfg)' : 'var(--fg3)'} />
      )),
    )}
  </svg>
);
const FileIcon = ({ accent }: { accent?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-none">
    <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5Z" stroke={accent ? 'var(--accfg)' : 'var(--fg3)'} strokeWidth="1.1" />
    <path d="M9 1.6V4.5h3" stroke={accent ? 'var(--accfg)' : 'var(--fg3)'} strokeWidth="1.1" />
  </svg>
);

function DropHere({ indent }: { indent?: boolean }) {
  return (
    <div className={cn('my-1 flex animate-pulse items-center gap-2.5 py-0.5', indent && 'ml-[27px]')}>
      <span className="h-2.5 w-2.5 flex-none rounded-full border-2 border-acc" />
      <span className="h-0 flex-1 border-t-2 border-dashed border-acc" />
      <span className="rounded-md bg-accsoft px-2 py-0.5 text-[10.5px] font-semibold text-accfg">Drop here</span>
    </div>
  );
}

export default function StructurePage() {
  const { profile, error } = useProfile();
  const { toast } = useToast();

  const [selWs, setSelWs] = useState<string | null>(null);
  const [wsOpen, setWsOpen] = useState(false);
  const ws = selWs ?? profile?.workspaces[0]?.id;
  const wsName = profile?.workspaces.find((w) => w.id === ws)?.name ?? '…';

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [edges, setEdges] = useState<Graph['edges']>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ws) return;
    const [list, graph] = await Promise.all([
      apiFetch<DocItem[]>(`/workspaces/${ws}/documents`).catch(() => []),
      apiFetch<Graph>(`/workspaces/${ws}/documents/graph`).catch(() => ({ edges: [] })),
    ]);
    setDocs(list);
    setEdges(graph.edges);
  }, [ws]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setMoved(new Set());
  }, [ws]);

  // incoming backlink count per file (real — from the graph)
  const incoming = useMemo(() => {
    const m = new Map<string, number>();
    edges.forEach((e) => m.set(e.to, (m.get(e.to) ?? 0) + 1));
    return m;
  }, [edges]);

  const dir = (p: string) => {
    const i = p.lastIndexOf('/');
    return i === -1 ? '' : p.slice(0, i);
  };
  const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);

  const { folders, rootFiles } = useMemo(() => {
    const byFolder = new Map<string, DocItem[]>();
    const root: DocItem[] = [];
    for (const d of [...docs].sort((a, b) => a.filePath.localeCompare(b.filePath))) {
      const folder = dir(d.filePath);
      if (!folder) root.push(d);
      else (byFolder.get(folder) ?? byFolder.set(folder, []).get(folder)!).push(d);
    }
    return {
      folders: [...byFolder.entries()].sort(([a], [b]) => a.localeCompare(b)),
      rootFiles: root,
    };
  }, [docs]);

  async function performMove(from: string, toFolder: string) {
    if (!ws || busy) return;
    const to = toFolder ? `${toFolder}/${base(from)}` : base(from);
    if (to === from) {
      setDragPath(null);
      setDropTarget(null);
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ refactoredLinks: number }>(
        `/workspaces/${ws}/documents/move`,
        { method: 'POST', body: JSON.stringify({ from, to }) },
      );
      const n = res.refactoredLinks;
      toast(
        `Moved to ${toFolder || 'root'}${n ? ` · ${n} link${n === 1 ? '' : 's'} refactored` : ''}`,
        'success',
      );
      if (toFolder) setOpen((o) => ({ ...o, [toFolder]: true }));
      setMoved((m) => new Set(m).add(to));
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Move failed', 'error');
    } finally {
      setBusy(false);
      setDragPath(null);
      setDropTarget(null);
    }
  }

  async function renameFolder(folder: string, items: DocItem[]) {
    setMenu(null);
    const next = window.prompt(`Rename folder "${folder}" to:`, folder)?.trim();
    if (!ws || !next || next === folder) return;
    setBusy(true);
    let total = 0;
    try {
      for (const it of items) {
        const to = `${next}/${base(it.filePath)}`;
        const res = await apiFetch<{ refactoredLinks: number }>(
          `/workspaces/${ws}/documents/move`,
          { method: 'POST', body: JSON.stringify({ from: it.filePath, to }) },
        );
        total += res.refactoredLinks;
        setMoved((m) => new Set(m).add(to));
      }
      toast(
        `Renamed to ${next}${total ? ` · ${total} link${total === 1 ? '' : 's'} refactored` : ''}`,
        'success',
      );
      setOpen((o) => ({ ...o, [next]: true }));
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Rename failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function createFromTemplate(body: string, name: string) {
    if (!ws) return;
    const fp = window.prompt(`New ${name} — file path (e.g. docs/new-page.md):`);
    if (!fp) return;
    const filePath = fp.toLowerCase().endsWith('.md') ? fp : `${fp}.md`;
    try {
      await apiFetch(`/workspaces/${ws}/documents`, {
        method: 'POST',
        body: JSON.stringify({ file_path: filePath, content_raw: body }),
      });
      toast(`Created ${filePath}`, 'success');
      setOpen((o) => ({ ...o, [dir(filePath)]: true }));
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Create failed', 'error');
    }
  }

  if (error) return <div className="p-10 text-fg2">{error}</div>;

  // file row used in the folder tree (right) and the unassigned list (left)
  const fileRow = (d: DocItem, opts: { indent?: boolean; showSize?: boolean }) => {
    const inc = incoming.get(d.filePath) ?? 0;
    const dragging = dragPath === d.filePath;
    return (
      <div
        key={d.filePath}
        draggable
        onDragStart={() => setDragPath(d.filePath)}
        onDragEnd={() => { setDragPath(null); setDropTarget(null); }}
        className={cn(
          'flex cursor-grab items-center gap-2.5 rounded-lg px-2.5 py-2 transition active:cursor-grabbing',
          opts.indent && 'ml-[27px]',
          dragging
            ? 'border border-acc bg-accsoft shadow-[0_8px_22px_-8px_rgba(124,58,237,.5)] [transform:rotate(-1deg)]'
            : 'hover:bg-rowhover',
        )}
      >
        <DragDots accent={dragging} />
        <FileIcon accent={dragging} />
        <span className={cn('flex-1 truncate text-[13.5px]', dragging ? 'font-medium text-fg' : 'text-fg2')}>
          {base(d.filePath)}
        </span>
        {dragging ? (
          <span className="text-[10.5px] font-medium text-accfg">moving…</span>
        ) : (
          <>
            {moved.has(d.filePath) && (
              <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
                moved
              </span>
            )}
            {opts.showSize ? (
              <span className="font-mono text-[10.5px] text-fg3">{fmtSize(d.size)}</span>
            ) : (
              <>
                {inc > 0 && (
                  <span className="rounded-md bg-accsoft px-1.5 py-0.5 text-[10px] font-semibold text-accfg">
                    {inc} link{inc === 1 ? '' : 's'}
                  </span>
                )}
                <Link
                  href={`/documents/view?path=${encodeURIComponent(d.filePath)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] text-muted hover:text-accfg"
                >
                  open
                </Link>
              </>
            )}
          </>
        )}
      </div>
    );
  };

  const dragInc = dragPath ? incoming.get(dragPath) ?? 0 : 0;
  const workspaces = profile?.workspaces ?? [];

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg text-fg2">
      {/* header */}
      <header className="flex flex-none items-center gap-3.5 border-b border-line bg-panel px-[18px] py-3">
        <Link href="/documents" className="flex items-center gap-2.5 rounded-lg border border-capbd bg-capbg px-3 py-1.5 text-[12.5px] font-semibold text-fg2 transition hover:border-acc">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M9.5 4l-4 4 4 4" stroke="var(--fg2)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Documents
        </Link>

        {/* project / workspace dropdown */}
        <div className="relative">
          <button
            onClick={() => setWsOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-[9px] border border-line bg-capbg px-2.5 py-1.5 transition hover:border-acc"
          >
            <span className="grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-gradient-to-br from-acc to-blue-500 text-[9px] font-bold text-white">
              {wsName.charAt(0).toUpperCase()}
            </span>
            <span className="text-[12px] text-fg3">Project:</span>
            <span className="max-w-[180px] truncate font-mono text-[13px] font-semibold text-fg">{wsName}</span>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="var(--fg3)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {wsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setWsOpen(false)} />
              <div className="absolute left-0 top-[calc(100%+7px)] z-50 w-[240px] rounded-xl border border-capbd bg-panel p-1.5 shadow-[0_16px_40px_-8px_rgba(0,0,0,.55)]">
                <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-fg3">
                  Switch project
                </div>
                {workspaces.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => { setSelWs(w.id); setWsOpen(false); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-rowhover"
                  >
                    <span className="h-4 w-4 flex-none rounded bg-gradient-to-br from-acc to-blue-500" />
                    <span className="flex-1 truncate font-mono text-[13px] text-fg">{w.name}</span>
                    {w.id === ws && (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8.5l3 3 7-7" stroke="var(--acc)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <span className="flex items-center gap-2 text-[12px] text-fg3">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
          {docs.length} documents
        </span>

        <div className="ml-auto flex items-center gap-3">
          <ThemeSwitcher />
          <span className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12.5px] font-semibold text-emerald-400">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5l3 3 7-7" stroke="#10b981" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Saved · applied instantly
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* left: templates + unassigned files */}
        <aside className="flex w-[300px] flex-none flex-col overflow-y-auto border-r border-line bg-panel">
          <div className="px-4 pb-2 pt-[18px]">
            <div className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.09em] text-fg3">
              Templates / Scaffolding
            </div>
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => createFromTemplate(t.body, t.name)}
                className="mb-2.5 flex w-full items-center gap-3 rounded-xl border border-line bg-capbg p-3 text-left transition hover:border-acc"
              >
                <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-accsoft">
                  <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                    <path d="M5.5 4.5L2.5 8l3 3.5M10.5 4.5l3 3.5-3 3.5" stroke="var(--accfg)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-fg">{t.name}</span>
                  {t.badges ? (
                    <span className="mt-1 flex gap-1.5">
                      <span className="rounded bg-emerald-500/15 px-1.5 py-px font-mono text-[9.5px] font-bold text-emerald-500">GET</span>
                      <span className="rounded bg-blue-500/15 px-1.5 py-px font-mono text-[9.5px] font-bold text-blue-400">POST</span>
                    </span>
                  ) : (
                    <span className="block text-[11.5px] text-fg3">{t.desc}</span>
                  )}
                </span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-none">
                  <path d="M8 3.5v9M3.5 8h9" stroke="var(--fg3)" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            ))}
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDropTarget('__root__'); }}
            onDragLeave={() => setDropTarget((t) => (t === '__root__' ? null : t))}
            onDrop={() => dragPath && performMove(dragPath, '')}
            className={cn(
              'mt-2 flex-1 border-t border-line2 px-4 pb-6 pt-[18px] transition',
              dropTarget === '__root__' && 'bg-accsoft',
            )}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-fg3">
                Unassigned Markdown files
              </span>
              <span className="rounded-[9px] bg-rowhover px-1.5 text-[10px] font-semibold text-fg2">
                {rootFiles.length}
              </span>
            </div>
            {rootFiles.map((d) => fileRow(d, { showSize: true }))}
            {dropTarget === '__root__' && <DropHere />}
            {rootFiles.length === 0 && dropTarget !== '__root__' && (
              <p className="text-[12px] text-muted">
                {dragPath ? 'Drop here to move to repository root' : 'No unassigned files.'}
              </p>
            )}
          </div>
        </aside>

        {/* main: folder tree */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[680px] px-10 pb-20 pt-8">
            <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-fg3">
              Sidebar menu structure
            </div>
            <p className="mb-5 text-[13px] text-fg3">
              Drag files and folders to organize how your documentation appears.
            </p>

            {dragPath && (
              <div className="mb-4 flex items-start gap-2.5 rounded-[9px] border border-blue-500/30 bg-blue-500/10 px-3 py-2.5 [border-left:3px_solid_#3b82f6]">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="mt-0.5 flex-none">
                  <circle cx="8" cy="8" r="6.3" stroke="#3b82f6" strokeWidth="1.3" />
                  <path d="M8 7.2v3.6M8 5v.1" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span className="text-[12.5px] leading-relaxed text-blue-300">
                  Moving <span className="font-mono text-fg">{base(dragPath)}</span> will automatically refactor{' '}
                  <strong className="font-semibold text-fg">
                    {dragInc} backlink{dragInc === 1 ? '' : 's'}
                  </strong>{' '}
                  across your repo.
                </span>
              </div>
            )}

            <div className="rounded-[14px] border border-line bg-panel p-2.5">
              {folders.length === 0 && rootFiles.length === 0 && (
                <p className="px-3 py-6 text-center text-[13px] text-fg3">No documents yet.</p>
              )}
              {folders.map(([folder, items], idx) => {
                const isOpen = open[folder] ?? true;
                return (
                  <div key={folder} className={idx > 0 ? 'mt-1.5' : ''}>
                    <div
                      onClick={() => setOpen((o) => ({ ...o, [folder]: !isOpen }))}
                      onDragOver={(e) => { e.preventDefault(); setDropTarget(folder); }}
                      onDragLeave={() => setDropTarget((t) => (t === folder ? null : t))}
                      onDrop={() => dragPath && performMove(dragPath, folder)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-[9px] px-3 py-2.5 transition hover:bg-rowhover',
                        dropTarget === folder && 'bg-accsoft shadow-[0_0_0_1px_var(--acc)]',
                      )}
                    >
                      <svg
                        width="14" height="14" viewBox="0 0 16 16" fill="none"
                        className="flex-none transition-transform"
                        style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}
                      >
                        <path d="M6 4l4 4-4 4" stroke="var(--fg2)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-none">
                        <path d="M1.6 4.4a1 1 0 0 1 1-1H6l1.4 1.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1V4.4Z" stroke="var(--accfg)" strokeWidth="1.2" />
                      </svg>
                      <span className="flex-1 truncate font-mono text-[13.5px] font-semibold text-fg">{folder}</span>
                      <span className="text-[11px] text-muted">{items.length} page{items.length === 1 ? '' : 's'}</span>
                      <div className="relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenu((m) => (m === folder ? null : folder)); }}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-fg3 transition hover:bg-rowhover hover:text-fg2"
                          aria-label="Folder actions"
                        >
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="3" r="1.2" fill="currentColor" />
                            <circle cx="8" cy="8" r="1.2" fill="currentColor" />
                            <circle cx="8" cy="13" r="1.2" fill="currentColor" />
                          </svg>
                        </button>
                        {menu === folder && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenu(null); }} />
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-[calc(100%+4px)] z-50 w-[170px] rounded-lg border border-capbd bg-panel p-1 shadow-[0_16px_40px_-8px_rgba(0,0,0,.55)]"
                            >
                              <button
                                onClick={() => renameFolder(folder, items)}
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] text-fg2 transition hover:bg-rowhover"
                              >
                                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                                  <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5Z" stroke="var(--accfg)" strokeWidth="1.3" strokeLinejoin="round" />
                                </svg>
                                Rename folder…
                              </button>
                              <button
                                onClick={() => { setOpen((o) => ({ ...o, [folder]: !isOpen })); setMenu(null); }}
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] text-fg2 transition hover:bg-rowhover"
                              >
                                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                                  <path d="M4 6l4 4 4-4" stroke="var(--fg3)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                {isOpen ? 'Collapse' : 'Expand'}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <div className="mt-0.5">
                        {items.map((d) => fileRow(d, { indent: true }))}
                        {dropTarget === folder && <DropHere indent />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
