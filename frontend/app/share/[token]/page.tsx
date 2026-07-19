'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { LogoMark } from '@/components/ui/Logo';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { apiFetch, ApiError } from '@/lib/api';
import { prose } from '@/lib/prose';
import 'highlight.js/styles/github-dark.css';

interface SharedDoc {
  title: string;
  html: string;
  updatedAt: string;
  workspaceName: string;
}

export default function SharedDocPage() {
  const token = String(useParams().token ?? '');
  const [doc, setDoc] = useState<SharedDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const articleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    apiFetch<SharedDoc>(`/public/docs/${encodeURIComponent(token)}`)
      .then(setDoc)
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : 'This shared link is no longer available.',
        ),
      );
  }, [token]);

  // Syntax-highlight code + render Mermaid, same as the authenticated reader.
  useEffect(() => {
    const root = articleRef.current;
    if (!doc || !root) return;
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
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
      });
      let i = 0;
      for (const code of blocks) {
        const pre = code.closest('pre');
        if (!pre) continue;
        try {
          const { svg } = await mermaid.render(
            `mmd-${i++}`,
            code.textContent ?? '',
          );
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
  }, [doc]);

  return (
    <div className="min-h-screen bg-bg text-fg2">
      <header className="flex items-center gap-2.5 border-b border-line bg-panel px-5 py-3">
        <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-gradient-to-br from-acc to-blue-500">
          <LogoMark className="h-4 w-4 text-white" />
        </span>
        <span className="text-[15px] font-bold tracking-tight text-fg">
          DocuGraph
        </span>
        <span className="rounded-md border border-capbd bg-accsoft px-2 py-0.5 text-[11px] font-semibold text-accfg">
          Shared · read-only
        </span>
        <div className="ml-auto">
          <ThemeSwitcher />
        </div>
      </header>

      <main className="mx-auto max-w-[800px] px-6 py-12 sm:px-14">
        {error && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            {error}
          </div>
        )}
        {!error && !doc && <p className="text-fg3">Loading…</p>}
        {doc && (
          <>
            <p className="mb-2 text-[13px] text-fg3">{doc.workspaceName}</p>
            <h1 className="mb-7 text-[40px] font-bold leading-[1.12] tracking-tight text-fg">
              {doc.title}
            </h1>
            <div
              ref={articleRef}
              className={prose}
              dangerouslySetInnerHTML={{ __html: doc.html }}
            />
          </>
        )}
      </main>
    </div>
  );
}
