'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LogoMark } from '@/components/ui/Logo';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { NoAccess } from '@/components/ui/NoAccess';
import { apiBaseUrl, apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useProfile } from '@/lib/useProfile';
import 'highlight.js/styles/github-dark.css';

interface DocItem {
  filePath: string;
  title: string;
}
interface FullDoc {
  filePath: string;
  title: string;
  contentRaw: string;
  contentHtml: string;
  metadata?: { tags?: string[]; status?: string | null };
  links: { outgoing: string[]; incoming: string[] };
}
interface Toc {
  id: string;
  text: string;
  level: number;
}

/** Szacowany czas czytania z wyrenderowanego HTML (~200 słów/min). */
function readingMinutes(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

const prose =
  'leading-[1.78] text-fg2 [&_h1]:mb-4 [&_h1]:mt-8 [&_h1]:text-[28px] [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-fg [&_h2]:mb-3 [&_h2]:mt-7 [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:text-fg [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-[18px] [&_h3]:font-semibold [&_h3]:text-fg [&_p]:mb-4 [&_p]:text-[16px] [&_a]:text-accfg [&_a]:underline [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_code]:rounded [&_code]:bg-capbg [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13.5px] [&_code]:text-accfg [&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-line [&_pre]:bg-[var(--codebg,#070c19)] [&_pre]:p-4 [&_pre>code]:bg-transparent [&_pre>code]:p-0 [&_pre>code]:text-fg2 [&_blockquote]:border-l-2 [&_blockquote]:border-acc [&_blockquote]:pl-4 [&_blockquote]:text-fg3';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function ReaderContent() {
  const params = useSearchParams();
  const path = params.get('path') ?? '';
  const { profile, error } = useProfile();
  const ws = profile?.workspaces[0]?.id;

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [doc, setDoc] = useState<FullDoc | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [toc, setToc] = useState<Toc[]>([]);
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const articleRef = useRef<HTMLDivElement>(null);

  function copyMarkdown() {
    if (!doc) return;
    void navigator.clipboard?.writeText(doc.contentRaw);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  useEffect(() => {
    if (!ws) return;
    apiFetch<DocItem[]>(`/workspaces/${ws}/documents`)
      .then(setDocs)
      .catch(() => setDocs([]));
  }, [ws]);

  useEffect(() => {
    if (!ws || !path) return;
    setNotFound(false);
    setForbidden(false);
    setDoc(null);
    apiFetch<FullDoc>(
      `/workspaces/${ws}/documents/by-path?path=${encodeURIComponent(path)}`,
    )
      .then(setDoc)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        else setNotFound(true);
      });
  }, [ws, path]);

  // Telemetria: rejestruj odczyt z czasem dwell przy opuszczeniu dokumentu.
  useEffect(() => {
    if (!ws || !path || !doc) return;
    const start = Date.now();
    let sent = false;
    const send = () => {
      if (sent) return;
      sent = true;
      const token = getToken();
      if (!token) return;
      fetch(`${apiBaseUrl}/workspaces/${ws}/documents/events/read`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ path, durationMs: Date.now() - start }),
      }).catch(() => {});
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') send();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', send);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', send);
      send(); // nawigacja SPA / odmontowanie
    };
  }, [ws, path, doc]);

  // Build the "On this page" TOC from rendered headings + assign ids.
  useEffect(() => {
    if (!doc || !articleRef.current) return;
    const hs = articleRef.current.querySelectorAll('h1, h2, h3');
    const items: Toc[] = [];
    hs.forEach((h) => {
      const text = h.textContent ?? '';
      const id = slugify(text);
      h.id = id;
      items.push({ id, text, level: Number(h.tagName[1]) });
    });
    setToc(items);
  }, [doc]);

  // Syntax-highlight code blocks + render Mermaid diagrams (lazy-loaded).
  useEffect(() => {
    const root = articleRef.current;
    if (!doc || raw || !root) return;
    let cancelled = false;
    void (async () => {
      const hljs = (await import('highlight.js')).default;
      if (cancelled) return;
      root.querySelectorAll('pre code').forEach((el) => {
        const c = el as HTMLElement;
        if (c.classList.contains('language-mermaid') || c.dataset.hl) return;
        hljs.highlightElement(c);
        c.dataset.hl = '1';
      });

      const blocks = Array.from(root.querySelectorAll('code.language-mermaid'));
      if (!blocks.length) return;
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
      let i = 0;
      for (const code of blocks) {
        const pre = code.closest('pre');
        if (!pre) continue;
        try {
          const { svg } = await mermaid.render(`mmd-${i++}`, code.textContent ?? '');
          if (cancelled) return;
          const wrap = document.createElement('div');
          wrap.className = 'my-5 flex justify-center overflow-x-auto';
          wrap.innerHTML = svg;
          pre.replaceWith(wrap);
        } catch {
          /* leave the original code block on parse error */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, raw]);

  // Group documents by top-level folder for the left tree.
  const groups = useMemo(() => {
    const g: Record<string, DocItem[]> = {};
    for (const d of docs) {
      const seg = d.filePath.includes('/') ? d.filePath.split('/')[0] : 'Root';
      (g[seg] ??= []).push(d);
    }
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [docs]);

  if (error) {
    return <div className="p-10 text-fg2">{error}</div>;
  }

  const crumbs = path.split('/');

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg text-fg2">
      {/* LEFT — doc tree */}
      <aside className="flex w-[250px] flex-none flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2.5 border-b border-line2 px-[18px] py-4">
          <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-gradient-to-br from-acc to-blue-500">
            <LogoMark className="h-4 w-4 text-white" />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-fg">
            DocuGraph
          </span>
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
              <div className="px-2.5 pb-2 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted">
                {group}
              </div>
              {items.map((d) => (
                <Link
                  key={d.filePath}
                  href={`/documents/view?path=${encodeURIComponent(d.filePath)}`}
                  className={cn(
                    'block truncate rounded-[7px] px-3 py-1.5 text-[13.5px] transition',
                    d.filePath === path
                      ? 'bg-accsoft font-semibold text-fg shadow-[inset_2px_0_0_var(--acc)]'
                      : 'text-fg3 hover:bg-rowhover hover:text-fg2',
                  )}
                >
                  {d.title}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* MIDDLE — content */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[800px] px-14 py-12">
          {forbidden && <NoAccess />}
          {notFound && <p className="text-fg3">Document not found.</p>}
          {doc && (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                {crumbs.map((seg, i) => (
                  <span key={i} className="flex items-center gap-2">
                    <span className={i === crumbs.length - 1 ? 'text-fg2' : ''}>
                      {seg}
                    </span>
                    {i < crumbs.length - 1 && (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4l4 4-4 4" stroke="var(--fg3)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                ))}
                <button
                  onClick={copyMarkdown}
                  className="ml-auto flex items-center gap-1.5 rounded-lg border border-capbd bg-capbg px-3 py-1.5 text-[12.5px] font-semibold text-fg2 transition hover:border-acc"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="var(--accfg)" strokeWidth="1.3" />
                    <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" stroke="var(--accfg)" strokeWidth="1.3" />
                  </svg>
                  {copied ? 'Copied' : 'Copy MD'}
                </button>
                <button
                  onClick={() => setRaw((r) => !r)}
                  className={`flex items-center gap-1.5 rounded-lg border bg-capbg px-3 py-1.5 text-[12.5px] font-semibold transition ${raw ? 'border-acc text-accfg' : 'border-capbd text-fg2 hover:border-acc'}`}
                >
                  {raw ? 'Rendered' : 'Raw'}
                </button>
                <Link
                  href={`/documents/review?path=${encodeURIComponent(path)}`}
                  className="flex items-center gap-1.5 rounded-lg border border-capbd bg-capbg px-3 py-1.5 text-[12.5px] font-semibold text-fg2 transition hover:border-acc"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M2 3.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H6l-3 2.5V11H3a1 1 0 0 1-1-1V3.5Z" stroke="var(--accfg)" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
                  Review
                </Link>
                <Link
                  href={`/documents/edit?path=${encodeURIComponent(path)}`}
                  className="flex items-center gap-1.5 rounded-lg border border-capbd bg-capbg px-3 py-1.5 text-[12.5px] font-semibold text-fg2 transition hover:border-acc"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5Z" stroke="var(--accfg)" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
                  Edit
                </Link>
              </div>
              <h1 className="mb-2.5 text-[40px] font-bold leading-[1.12] tracking-tight text-fg">
                {doc.title}
              </h1>
              <div className="mb-7 flex flex-wrap items-center gap-2.5 text-[13px] text-fg3">
                <span className="flex items-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M8 5v3l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {readingMinutes(doc.contentHtml)} min read
                </span>
                {(doc.metadata?.tags ?? []).map((t) => (
                  <Link
                    key={t}
                    href={`/documents?tag=${encodeURIComponent(t)}`}
                    className="rounded-md bg-accsoft px-2 py-0.5 text-[11.5px] font-medium text-accfg transition hover:opacity-80"
                  >
                    #{t}
                  </Link>
                ))}
              </div>
              {raw ? (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-line bg-[var(--codebg,#070c19)] p-4 font-mono text-[13px] leading-relaxed text-fg2">
                  {doc.contentRaw}
                </pre>
              ) : (
                <div
                  ref={articleRef}
                  className={prose}
                  dangerouslySetInnerHTML={{ __html: doc.contentHtml }}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* RIGHT — TOC + relations */}
      <aside className="flex w-[260px] flex-none flex-col border-l border-line px-5 py-6">
        <ThemeSwitcher />

        <div className="mb-3.5 mt-6 text-[10.5px] font-bold uppercase tracking-[0.11em] text-muted">
          On this page
        </div>
        <div className="flex flex-col">
          {toc.map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              className={cn(
                'py-1 text-[13px] text-fg3 transition hover:text-fg2',
                t.level === 3 ? 'pl-7' : 'pl-3.5',
              )}
            >
              {t.text}
            </a>
          ))}
          {toc.length === 0 && (
            <span className="pl-3.5 text-[13px] text-fg3">—</span>
          )}
        </div>

        {doc && doc.links.outgoing.length > 0 && (
          <div className="mt-8">
            <div className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.11em] text-muted">
              Related documents
            </div>
            <div className="grid gap-1">
              {doc.links.outgoing.map((p) => (
                <Link
                  key={p}
                  href={`/documents/view?path=${encodeURIComponent(p)}`}
                  className="truncate rounded-lg px-2 py-1.5 font-mono text-[11.5px] text-fg3 transition hover:bg-rowhover hover:text-fg2"
                >
                  {p}
                </Link>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<div className="p-10 text-fg3">Loading…</div>}>
      <ReaderContent />
    </Suspense>
  );
}
