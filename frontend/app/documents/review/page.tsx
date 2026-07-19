'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import MarkdownIt from 'markdown-it';
import { LogoMark } from '@/components/ui/Logo';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { prose } from '@/lib/prose';
import { apiFetch, ApiError } from '@/lib/api';
import { useProfile } from '@/lib/useProfile';
import { MentionTextarea, MentionMember } from '@/components/MentionTextarea';

interface Comment {
  id: string;
  line: number;
  quote: string;
  body: string;
  resolved: boolean;
  author: string;
  createdAt: string;
}

function blockText(block: string): string {
  return block
    .replace(/[#>*`_\-[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70);
}
function relTime(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function ReviewContent() {
  const params = useSearchParams();
  const { toast } = useToast();
  const { profile, error } = useProfile();
  const ws = profile?.workspaces[0]?.id;
  const path = params.get('path') ?? '';

  const md = useMemo(() => new MarkdownIt({ html: false, linkify: true }), []);
  const [content, setContent] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [draftMentions, setDraftMentions] = useState<string[]>([]);
  const [members, setMembers] = useState<MentionMember[]>([]);
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    if (!ws) return;
    apiFetch<{ userId: string; name: string }[]>(`/workspaces/${ws}/members`)
      .then((m) => setMembers(m.map((x) => ({ userId: x.userId, name: x.name }))))
      .catch(() => setMembers([]));
  }, [ws]);

  const loadComments = useCallback(async () => {
    if (!ws || !path) return;
    const c = await apiFetch<Comment[]>(
      `/workspaces/${ws}/documents/comments?path=${encodeURIComponent(path)}`,
    ).catch(() => []);
    setComments(c);
  }, [ws, path]);

  useEffect(() => {
    if (!ws || !path) return;
    apiFetch<{ contentRaw: string }>(
      `/workspaces/${ws}/documents/by-path?path=${encodeURIComponent(path)}`,
    )
      .then((d) => setContent(d.contentRaw))
      .catch(() => setContent(''));
    void loadComments();
  }, [ws, path, loadComments]);

  const blocks = useMemo(() => {
    const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
    return body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  }, [content]);

  // group comments by block index
  const threads = useMemo(() => {
    const byLine = new Map<number, Comment[]>();
    for (const c of comments) {
      (byLine.get(c.line) ?? byLine.set(c.line, []).get(c.line)!).push(c);
    }
    return [...byLine.entries()]
      .map(([line, list]) => ({
        line,
        list,
        resolved: list.every((c) => c.resolved),
        quote: list[0]?.quote ?? '',
      }))
      .sort((a, b) => a.line - b.line);
  }, [comments]);

  const lineState = useMemo(() => {
    const m = new Map<number, 'open' | 'resolved'>();
    threads.forEach((t) => m.set(t.line, t.resolved ? 'resolved' : 'open'));
    return m;
  }, [threads]);

  const openCount = threads.filter((t) => !t.resolved).length;

  async function addComment(line: number, body: string, mentions: string[] = []) {
    if (!ws || !body.trim()) return;
    try {
      await apiFetch(`/workspaces/${ws}/documents/comments`, {
        method: 'POST',
        body: JSON.stringify({
          path,
          line,
          quote: blockText(blocks[line] ?? ''),
          body: body.trim(),
          ...(mentions.length ? { mentions } : {}),
        }),
      });
      await loadComments();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to comment', 'error');
    }
  }

  async function setResolved(line: number, resolved: boolean) {
    if (!ws) return;
    await apiFetch(`/workspaces/${ws}/documents/comments/resolve`, {
      method: 'POST',
      body: JSON.stringify({ path, line, resolved }),
    });
    toast(resolved ? 'Thread resolved' : 'Thread reopened', 'success');
    await loadComments();
  }

  if (error) return <div className="p-10 text-fg2">{error}</div>;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg text-fg2">
      {/* top bar */}
      <header className="flex flex-none items-center gap-3.5 border-b border-line bg-panel px-5 py-3">
        <Link href={`/documents/view?path=${encodeURIComponent(path)}`} className="flex items-center gap-2">
          <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-gradient-to-br from-acc to-blue-500">
            <LogoMark className="h-4 w-4 text-white" />
          </span>
        </Link>
        <span className="font-mono text-[13px] text-fg2">{path}</span>
        <span
          className={cn(
            'rounded-md border px-2 py-0.5 text-[11px] font-semibold',
            approved
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-capbd bg-accsoft text-accfg',
          )}
        >
          {approved ? 'Approved' : 'In review'}
        </span>
        <div className="ml-auto flex items-center gap-2.5">
          <ThemeSwitcher />
          <button
            onClick={() => setApproved(false)}
            className="rounded-lg border border-red-500/35 px-3 py-2 text-[13px] font-medium text-red-400 transition hover:bg-red-500/10"
          >
            Request changes
          </button>
          <button
            onClick={() => {
              if (openCount === 0) {
                setApproved(true);
                toast('Document approved', 'success');
              }
            }}
            disabled={openCount > 0}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white transition',
              openCount > 0 ? 'cursor-not-allowed bg-muted' : 'bg-emerald-600 hover:opacity-90',
            )}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5l3 3 7-7" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {approved ? 'Approved' : openCount > 0 ? `Approve (${openCount} open)` : 'Approve'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* document blocks */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[680px] px-12 py-10">
            <div className={prose}>
              {blocks.map((b, i) => {
                const state = lineState.get(i);
                return (
                  <div
                    key={i}
                    onClick={() => setSelected(i)}
                    className={cn(
                      '-mx-2.5 cursor-pointer rounded-md px-2.5 transition',
                      selected === i && 'shadow-[0_0_0_1px_var(--acc)]',
                      state === 'open' && 'bg-amber-500/10 shadow-[inset_3px_0_0_#f59e0b]',
                      state === 'resolved' && 'bg-emerald-500/10 shadow-[inset_3px_0_0_#10b981]',
                      !state && 'hover:bg-rowhover',
                    )}
                    dangerouslySetInnerHTML={{ __html: md.render(b) }}
                  />
                );
              })}
              {blocks.length === 0 && <p className="text-fg3">Empty document.</p>}
            </div>
          </div>
        </main>

        {/* comments panel */}
        <aside className="flex w-[340px] flex-none flex-col border-l border-line bg-panel">
          <div className="flex items-center gap-2.5 border-b border-line2 px-[18px] py-4">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 3.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H6l-3 2.5V11H3a1 1 0 0 1-1-1V3.5Z" stroke="var(--accfg)" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            <span className="text-[15px] font-bold text-fg">Review comments</span>
            <span className="ml-auto rounded-full bg-capbg px-2 py-0.5 text-[11px] font-semibold text-fg3">
              {openCount} open
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3.5">
            {/* new comment composer for selected block */}
            {selected !== null && !lineState.get(selected) && (
              <div className="rounded-xl border border-acc/50 bg-card p-3">
                <div className="mb-2 border-l-2 border-capbd pl-2 text-[12px] italic text-fg3">
                  &quot;{blockText(blocks[selected] ?? '')}&quot;
                </div>
                <MentionTextarea
                  value={draft}
                  onChange={setDraft}
                  onMentionsChange={setDraftMentions}
                  members={members}
                  rows={3}
                  placeholder="Add a comment… use @ to mention"
                  className="w-full resize-none rounded-lg border border-capbd bg-bg px-3 py-2 text-[13px] text-fg outline-none focus:border-acc"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => { setSelected(null); setDraft(''); setDraftMentions([]); }}
                    className="rounded-lg px-3 py-1.5 text-[12.5px] text-fg3 hover:text-fg2"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => { await addComment(selected, draft, draftMentions); setDraft(''); setDraftMentions([]); }}
                    className="rounded-lg bg-acc px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90"
                  >
                    Comment
                  </button>
                </div>
              </div>
            )}

            {threads.map((th) => (
              <div
                key={th.line}
                className={cn(
                  'overflow-hidden rounded-xl border bg-card',
                  selected === th.line ? 'border-acc' : 'border-line2',
                )}
                onClick={() => setSelected(th.line)}
              >
                <div className="border-b border-line2 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: th.resolved ? '#10b981' : '#f59e0b' }}
                    />
                    <span
                      className="text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: th.resolved ? '#10b981' : '#f59e0b' }}
                    >
                      {th.resolved ? 'Resolved' : 'Open'}
                    </span>
                    <span className="ml-auto font-mono text-[11px] text-muted">
                      block {th.line + 1}
                    </span>
                  </div>
                  <div className="mt-1.5 border-l-2 border-capbd pl-2 text-[12px] italic text-fg3">
                    &quot;{th.quote || blockText(blocks[th.line] ?? '')}&quot;
                  </div>
                </div>
                <div className="flex flex-col gap-3 p-3">
                  {th.list.map((cm) => (
                    <div key={cm.id} className="flex gap-2.5">
                      <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-gradient-to-br from-acc to-blue-500 text-[9px] font-semibold text-white">
                        {initials(cm.author)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] font-semibold text-fg">{cm.author}</span>
                          <span className="text-[11px] text-muted">{relTime(cm.createdAt)}</span>
                        </div>
                        <div className="mt-0.5 text-[13px] leading-relaxed text-fg2">{cm.body}</div>
                      </div>
                    </div>
                  ))}
                  {!th.resolved ? (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        value={replies[th.line] ?? ''}
                        onChange={(e) => setReplies((r) => ({ ...r, [th.line]: e.target.value }))}
                        placeholder="Reply…"
                        className="h-8 flex-1 rounded-lg border border-capbd bg-bg px-2.5 text-[12.5px] text-fg outline-none focus:border-acc"
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && (replies[th.line] ?? '').trim()) {
                            await addComment(th.line, replies[th.line]);
                            setReplies((r) => ({ ...r, [th.line]: '' }));
                          }
                        }}
                      />
                      <button
                        onClick={() => setResolved(th.line, true)}
                        className="whitespace-nowrap rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-[7px] text-[12px] font-semibold text-emerald-400"
                      >
                        Resolve
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[12px] text-emerald-400" onClick={(e) => e.stopPropagation()}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6.3" stroke="#10b981" strokeWidth="1.3" />
                        <path d="M5 8l2 2 4-4" stroke="#10b981" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Resolved ·{' '}
                      <button onClick={() => setResolved(th.line, false)} className="text-accfg">
                        Reopen
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div className="flex items-center justify-center gap-2 py-2 text-[12px] text-muted">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M8 3.5v9M3.5 8h9" stroke="var(--muted)" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              Click a block to comment
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="p-10 text-fg3">Loading…</div>}>
      <ReviewContent />
    </Suspense>
  );
}
