'use client';

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import MarkdownIt from 'markdown-it';
import { LogoMark } from '@/components/ui/Logo';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { prose } from '@/lib/prose';
import { apiFetch, ApiError } from '@/lib/api';
import { useProfile } from '@/lib/useProfile';

interface FullDoc {
  filePath: string;
  contentRaw: string;
  metadata: { tags: string[]; status: string | null; version: string | null };
  links: { outgoing: string[]; incoming: string[] };
}
interface DocItem {
  filePath: string;
  title: string;
}
interface Revision {
  id: string;
  title: string;
  createdAt: string;
  author: string;
}

type Seg = 'edit' | 'preview' | 'split';

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function EditorContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { profile, error } = useProfile();
  const ws = profile?.workspaces[0]?.id;

  const initialPath = params.get('path') ?? '';
  const isNew = !initialPath;

  const [filePath, setFilePath] = useState(initialPath);
  const [content, setContent] = useState('');
  const [doc, setDoc] = useState<FullDoc | null>(null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [seg, setSeg] = useState<Seg>('split');
  const [saving, setSaving] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [commitMsg, setCommitMsg] = useState('');

  // --- Link autocomplete (typing `](` suggests existing document paths) ---
  const taRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<number | null>(null);
  const [ac, setAc] = useState<{ query: string; start: number } | null>(null);
  const [acIndex, setAcIndex] = useState(0);

  const acMatches = useMemo(() => {
    if (!ac) return [];
    const q = ac.query.toLowerCase();
    return docs
      .filter((d) => d.filePath !== initialPath)
      .filter(
        (d) =>
          !q ||
          d.filePath.toLowerCase().includes(q) ||
          d.title.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [ac, docs, initialPath]);

  /** Wykryj trigger `](partial` tuż przed karetką i otwórz podpowiedzi. */
  function refreshAutocomplete(value: string, caret: number) {
    const before = value.slice(0, caret);
    const m = before.match(/\]\(([^)\s\n]*)$/);
    if (m) {
      setAc({ query: m[1], start: caret - m[1].length });
      setAcIndex(0);
    } else if (ac) {
      setAc(null);
    }
  }

  function onEditorChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value);
    refreshAutocomplete(e.target.value, e.target.selectionStart);
  }

  function insertPath(path: string) {
    if (!ac) return;
    const end = ac.start + ac.query.length;
    const next = content.slice(0, ac.start) + path + content.slice(end);
    caretRef.current = ac.start + path.length;
    setContent(next);
    setAc(null);
  }

  function onEditorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!ac || acMatches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAcIndex((i) => (i + 1) % acMatches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAcIndex((i) => (i - 1 + acMatches.length) % acMatches.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertPath(acMatches[acIndex].filePath);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAc(null);
    }
  }

  // Po programowej zmianie treści przywróć karetkę w policzonym miejscu.
  useEffect(() => {
    if (caretRef.current != null && taRef.current) {
      const pos = caretRef.current;
      caretRef.current = null;
      taRef.current.focus();
      taRef.current.setSelectionRange(pos, pos);
    }
  }, [content]);

  /** Wstaw szablon front matter na górze, jeśli go jeszcze nie ma. */
  function insertFrontmatter() {
    if (/^---\r?\n/.test(content)) {
      toast('This document already has front matter', 'error');
      return;
    }
    const tpl = '---\ntitle: \ntags: []\nstatus: draft\n---\n\n';
    caretRef.current = tpl.indexOf('title: ') + 'title: '.length;
    setContent(tpl + content);
    setSeg('split');
  }

  async function loadRevisions() {
    if (!ws || !initialPath) return;
    try {
      const revs = await apiFetch<Revision[]>(
        `/workspaces/${ws}/documents/revisions?path=${encodeURIComponent(initialPath)}`,
      );
      setRevisions(revs);
    } catch {
      setRevisions([]);
    }
  }

  const md = useMemo(() => new MarkdownIt({ html: false, linkify: true }), []);

  // Podgląd odcina front matter (jak gray-matter na backendzie).
  const previewHtml = useMemo(() => {
    const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
    return md.render(body);
  }, [content, md]);

  useEffect(() => {
    if (!ws || !initialPath) return;
    apiFetch<FullDoc>(
      `/workspaces/${ws}/documents/by-path?path=${encodeURIComponent(initialPath)}`,
    )
      .then((d) => {
        setDoc(d);
        setContent(d.contentRaw);
      })
      .catch(() => toast('Could not load document', 'error'));
  }, [ws, initialPath, toast]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void loadRevisions(), [ws, initialPath]);

  // lista dokumentów do lewego drzewa
  useEffect(() => {
    if (!ws) return;
    apiFetch<DocItem[]>(`/workspaces/${ws}/documents`)
      .then(setDocs)
      .catch(() => setDocs([]));
  }, [ws]);

  // synchronizuj ścieżkę zapisu przy nawigacji między plikami
  useEffect(() => setFilePath(initialPath), [initialPath]);

  const groups = useMemo(() => {
    const by = new Map<string, DocItem[]>();
    for (const d of [...docs].sort((a, b) => a.filePath.localeCompare(b.filePath))) {
      const i = d.filePath.lastIndexOf('/');
      const g = i === -1 ? 'root' : d.filePath.slice(0, i);
      (by.get(g) ?? by.set(g, []).get(g)!).push(d);
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [docs]);

  async function save() {
    if (!ws) return;
    if (!filePath.trim() || !content.trim()) {
      toast('File path and content are required', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/workspaces/${ws}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          file_path: filePath,
          content_raw: content,
          message: commitMsg.trim() || undefined,
        }),
      });
      toast('Document saved', 'success');
      setCommitMsg('');
      await loadRevisions();
      if (isNew) {
        router.replace(`/documents/edit?path=${encodeURIComponent(filePath)}`);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return <div className="p-10 text-fg2">{error}</div>;
  }

  const showEditor = seg !== 'preview';
  const showPreview = seg !== 'edit';
  const lineCount = content.split('\n').length;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg text-fg2">
      {/* LEFT — file tree */}
      <aside className="flex w-[230px] flex-none flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2.5 border-b border-line2 px-[18px] py-4">
          <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-gradient-to-br from-acc to-blue-500">
            <LogoMark className="h-4 w-4 text-white" />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-fg">DocuGraph</span>
        </div>
        <Link
          href="/documents"
          className="flex items-center gap-2 border-b border-line2 px-[18px] py-2.5 text-[12.5px] text-fg3 transition hover:text-fg2"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All documents
        </Link>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map(([group, items]) => (
            <div key={group} className="mb-4">
              <div className="px-2.5 pb-2 pt-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted">
                {group}
              </div>
              {items.map((d) => (
                <Link
                  key={d.filePath}
                  href={`/documents/edit?path=${encodeURIComponent(d.filePath)}`}
                  className={cn(
                    'flex items-center gap-2 truncate rounded-[7px] px-2.5 py-1.5 text-[13px] transition',
                    d.filePath === initialPath
                      ? 'bg-accsoft font-semibold text-fg shadow-[inset_2px_0_0_var(--acc)]'
                      : 'text-fg3 hover:bg-rowhover hover:text-fg2',
                  )}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-none">
                    <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5Z" stroke="currentColor" strokeWidth="1.1" />
                  </svg>
                  <span className="truncate">{d.filePath.slice(d.filePath.lastIndexOf('/') + 1)}</span>
                </Link>
              ))}
            </div>
          ))}
          {docs.length === 0 && (
            <p className="px-2.5 text-[12.5px] text-fg3">No documents yet.</p>
          )}
        </nav>
      </aside>

      {/* MIDDLE (main editor area) */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <div className="flex flex-none items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="grid h-7 w-7 place-items-center rounded-lg border border-line text-fg3 transition hover:bg-rowhover hover:text-fg2"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Link href="/documents" className="flex items-center gap-2">
            <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-gradient-to-br from-acc to-blue-500">
              <LogoMark className="h-4 w-4 text-white" />
            </span>
          </Link>
          {isNew ? (
            <input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="docs/new-file.md"
              className="w-64 rounded-md border border-inputbd bg-card px-2.5 py-1.5 font-mono text-[12.5px] text-fg outline-none focus:border-acc"
            />
          ) : (
            <span className="font-mono text-[12.5px] text-fg2">{filePath}</span>
          )}
          <span className="rounded-md border border-capbd bg-accsoft px-2 py-0.5 text-[10.5px] font-semibold text-accfg">
            Markdown
          </span>

          <div className="ml-auto flex items-center gap-2.5">
            <button
              onClick={insertFrontmatter}
              title="Insert a front matter block (title, tags, status)"
              className="hidden items-center gap-1.5 rounded-[9px] border border-capbd bg-capbg px-2.5 py-1.5 text-[12px] font-semibold text-fg2 transition hover:border-acc sm:flex"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M2.5 3.5h11M2.5 6.5h11M4 9.5h8M4 12.5h5" stroke="var(--accfg)" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              Frontmatter
            </button>
            <ThemeSwitcher />
            {/* segment control */}
            <div className="flex items-center gap-1 rounded-[9px] border border-line bg-card p-[3px]">
              {(['edit', 'preview', 'split'] as Seg[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeg(s)}
                  className={cn(
                    'rounded-[7px] px-2.5 py-1 text-[12px] font-semibold capitalize transition',
                    seg === s ? 'bg-rowhover text-fg' : 'text-fg3 hover:text-fg2',
                  )}
                >
                  {s === 'split' ? 'Split' : s}
                </button>
              ))}
            </div>
            <input
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Describe change (optional)"
              className="hidden w-48 rounded-[9px] border border-inputbd bg-card px-2.5 py-1.5 text-[12px] text-fg outline-none placeholder:text-fg3 focus:border-acc lg:block"
            />
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        {/* panes */}
        <div className="flex min-h-0 flex-1">
          {showEditor && (
            <section className="flex min-w-0 flex-1 flex-col bg-[var(--codebg,#070c19)]">
              <div className="flex flex-none items-center border-b border-line2 px-4 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Markdown
                </span>
                <span className="ml-auto font-mono text-[10.5px] text-fg3">
                  {lineCount} lines · UTF-8
                </span>
              </div>
              <div className="relative min-h-0 flex-1">
                <textarea
                  ref={taRef}
                  value={content}
                  onChange={onEditorChange}
                  onKeyDown={onEditorKeyDown}
                  onClick={(e) =>
                    refreshAutocomplete(
                      e.currentTarget.value,
                      e.currentTarget.selectionStart,
                    )
                  }
                  onBlur={() => setTimeout(() => setAc(null), 120)}
                  placeholder="# Title&#10;&#10;Write Markdown…  (type ]( to link a document)"
                  spellCheck={false}
                  className="absolute inset-0 resize-none bg-transparent p-4 font-mono text-[13px] leading-[21px] text-fg2 outline-none placeholder:text-fg3"
                />
                {ac && acMatches.length > 0 && (
                  <div className="absolute bottom-3 left-3 z-10 w-[min(420px,90%)] overflow-hidden rounded-[10px] border border-line bg-card shadow-2xl">
                    <div className="border-b border-line2 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
                      Link a document · ↑↓ Enter · Esc
                    </div>
                    {acMatches.map((d, i) => (
                      <button
                        key={d.filePath}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertPath(d.filePath);
                        }}
                        onMouseEnter={() => setAcIndex(i)}
                        className={cn(
                          'flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition',
                          i === acIndex ? 'bg-accsoft' : 'hover:bg-rowhover',
                        )}
                      >
                        <span className="text-[12.5px] text-fg2">{d.title}</span>
                        <span className="truncate font-mono text-[11px] text-fg3">
                          {d.filePath}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {showPreview && (
            <section className="flex min-w-0 flex-1 flex-col border-l border-line bg-panel">
              <div className="flex flex-none items-center border-b border-line2 px-5 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Preview
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-10 py-8">
                <div
                  className={cn(prose, 'max-w-[640px]')}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </section>
          )}
        </div>
      </main>

      {/* RIGHT — metadata + relations */}
      <aside className="flex w-[260px] flex-none flex-col overflow-y-auto border-l border-line bg-panel">
        <div className="border-b border-line2 p-4">
          <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
            Document metadata
          </div>
          <Meta label="Status" value={doc?.metadata.status ?? (isNew ? '—' : 'published')} />
          <Meta label="Version" value={doc?.metadata.version ?? '—'} />
          <Meta
            label="Tags"
            value={doc?.metadata.tags?.length ? doc.metadata.tags.join(', ') : '—'}
          />
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
              Related documents
            </span>
            <span className="rounded-full bg-rowhover px-[7px] py-px text-[10.5px] font-semibold text-fg3">
              {doc?.links.outgoing.length ?? 0}
            </span>
          </div>
          <div className="grid gap-2">
            {(doc?.links.outgoing ?? []).map((p) => (
              <Link
                key={p}
                href={`/documents/edit?path=${encodeURIComponent(p)}`}
                className="flex gap-2 rounded-lg border border-line2 bg-card px-2.5 py-2 transition hover:border-acc"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="mt-px flex-none">
                  <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5Z" stroke="var(--fg3)" strokeWidth="1.1" />
                </svg>
                <span className="truncate font-mono text-[11.5px] text-fg2">{p}</span>
              </Link>
            ))}
            {(!doc || doc.links.outgoing.length === 0) && (
              <span className="text-[12px] text-fg3">No outgoing links.</span>
            )}
          </div>
          <div className="mb-3 mt-5 flex items-center gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
              Backlinks
            </span>
            <span className="rounded-full bg-rowhover px-[7px] py-px text-[10.5px] font-semibold text-fg3">
              {doc?.links.incoming.length ?? 0}
            </span>
          </div>
          <div className="grid gap-2">
            {(doc?.links.incoming ?? []).map((p) => (
              <Link
                key={p}
                href={`/documents/edit?path=${encodeURIComponent(p)}`}
                className="flex gap-2 rounded-lg border border-line2 bg-card px-2.5 py-2 transition hover:border-acc"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="mt-px flex-none">
                  <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5Z" stroke="var(--fg3)" strokeWidth="1.1" />
                </svg>
                <span className="truncate font-mono text-[11.5px] text-fg2">{p}</span>
              </Link>
            ))}
            {(!doc || doc.links.incoming.length === 0) && (
              <span className="text-[12px] text-fg3">No backlinks yet.</span>
            )}
          </div>
        </div>
        {/* edit history shortcut */}
        {!isNew && (
          <div className="border-t border-line2 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                Edit history
              </span>
              <span className="rounded-full bg-rowhover px-[7px] py-px text-[10.5px] font-semibold text-fg3">
                {revisions.length}
              </span>
            </div>
            <div className="grid gap-2.5">
              {revisions.slice(0, 3).map((r) => (
                <div key={r.id} className="flex items-center gap-2.5">
                  <span className="mt-0.5 h-1.5 w-1.5 flex-none rounded-full bg-acc" />
                  <div className="min-w-0">
                    <div className="text-[12.5px] text-fg2">{r.author}</div>
                    <div className="text-[11px] text-fg3">
                      {relTime(r.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
              {revisions.length === 0 && (
                <span className="text-[12px] text-fg3">No edits recorded.</span>
              )}
            </div>
            <Link
              href={`/documents/history?path=${encodeURIComponent(filePath)}`}
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-accfg"
            >
              View full history
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-line2 py-[7px] first:border-t-0">
      <span className="text-[12px] text-fg3">{label}</span>
      <span className="max-w-[150px] truncate text-[12px] capitalize text-fg2">
        {value}
      </span>
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="p-10 text-fg3">Loading…</div>}>
      <EditorContent />
    </Suspense>
  );
}
