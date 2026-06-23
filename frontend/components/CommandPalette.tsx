'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/cn';
import { LogoMark } from '@/components/ui/Logo';

interface DocItem {
  filePath: string;
  title: string;
  updatedAt: string;
}
type ActionIcon = 'plus' | 'folder' | 'key';
interface Item {
  kind: 'doc' | 'action';
  label: string;
  hint: string;
  href: string;
  shortcut?: string;
  meta?: string;
  icon?: ActionIcon;
}

const ACTIONS: Item[] = [
  { kind: 'action', label: 'Create new document', hint: '', href: '/documents', shortcut: '⌘N', icon: 'plus' },
  { kind: 'action', label: 'Go to documents', hint: '', href: '/documents', shortcut: '⌘P', icon: 'folder' },
  { kind: 'action', label: 'Generate API key', hint: '', href: '/team', icon: 'key' },
];

function rel(iso: string): string {
  const m = Math.round((Date.now() - +new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span className="font-bold text-accfg">{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  );
}

/** Otwiera Command Palette z dowolnego miejsca (np. klik w pasku bocznym). */
export function openCommandPalette() {
  window.dispatchEvent(new Event('open-command-palette'));
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(0);

  // ⌘K toggle + Esc close + klikalny trigger (event)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-command-palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    apiFetch<{ workspaces: { id: string }[] }>('/auth/me')
      .then((me) => {
        const ws = me.workspaces[0]?.id;
        return ws ? apiFetch<DocItem[]>(`/workspaces/${ws}/documents`) : [];
      })
      .then((d) => setDocs(d ?? []))
      .catch(() => setDocs([]));
  }, [open, loaded]);

  const docResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = docs
      .filter(
        (d) =>
          !q ||
          d.title.toLowerCase().includes(q) ||
          d.filePath.toLowerCase().includes(q),
      )
      .slice(0, 6)
      .map<Item>((d) => ({
        kind: 'doc',
        label: d.title,
        hint: d.filePath,
        href: `/documents/view?path=${encodeURIComponent(d.filePath)}`,
        meta: d.updatedAt ? `modified ${rel(d.updatedAt)}` : undefined,
      }));
    return list;
  }, [docs, query]);

  const actions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ACTIONS.filter((a) => !q || a.label.toLowerCase().includes(q));
  }, [query]);

  const items = useMemo(() => [...docResults, ...actions], [docResults, actions]);

  useEffect(() => setActive(0), [query, open]);

  // Arrow nav + Enter
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const it = items[active];
        if (it) go(it.href);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items, active]);

  function go(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  if (!open) return null;

  const q = query.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]"
      onClick={() => setOpen(false)}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[640px] overflow-hidden rounded-[14px] border border-line bg-panel shadow-2xl"
      >
        {/* search */}
        <div className="flex items-center gap-3 border-b border-line px-5 py-[18px]">
          <svg width="19" height="19" viewBox="0 0 16 16" fill="none" className="flex-none">
            <circle cx="7" cy="7" r="4.4" stroke="var(--fg3)" strokeWidth="1.3" />
            <path d="M10.6 10.6L14 14" stroke="var(--fg3)" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents or run a command…"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-muted"
          />
          {q && (
            <span className="flex-none whitespace-nowrap text-[13px] text-muted">— in documentation</span>
          )}
          <span className="flex-none rounded-md border border-capbd bg-capbg px-2 py-[3px] text-[10.5px] font-semibold text-fg2">
            ESC
          </span>
        </div>

        {/* results */}
        <div className="max-h-[430px] overflow-y-auto p-2">
          {docResults.length > 0 && (
            <div className="px-3.5 pb-1.5 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
              Document matches
            </div>
          )}
          {docResults.map((it, idx) => (
            <Row
              key={it.href + idx}
              item={it}
              active={active === idx}
              onClick={() => go(it.href)}
              q={q}
            />
          ))}

          {actions.length > 0 && (
            <div className="px-3.5 pb-1.5 pt-3.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
              Quick actions
            </div>
          )}
          {actions.map((it, idx) => (
            <Row
              key={it.label + idx}
              item={it}
              active={active === docResults.length + idx}
              onClick={() => go(it.href)}
              q={q}
            />
          ))}

          {q && (
            <button
              onClick={() => go(`/search?q=${encodeURIComponent(q)}`)}
              className="mt-1.5 flex w-full items-center gap-2.5 rounded-[9px] border-t border-line2 px-3.5 py-2.5 text-left text-[13px] text-fg2 transition hover:bg-rowhover"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="flex-none">
                <circle cx="7" cy="7" r="4.4" stroke="var(--accfg)" strokeWidth="1.3" />
                <path d="M10.6 10.6L14 14" stroke="var(--accfg)" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              Full-text search for <span className="font-semibold text-fg">&ldquo;{q}&rdquo;</span>
              <span className="ml-auto text-[11px] text-muted">all results →</span>
            </button>
          )}

          {items.length === 0 && !q && (
            <div className="px-3.5 py-6 text-center text-sm text-fg3">
              No results
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center gap-[18px] border-t border-line bg-capbg px-[18px] py-[11px] text-[11.5px] text-muted">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> to open
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>&gt;</Kbd> for commands
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <LogoMark className="h-3 w-3 text-acc" />
            DocuGraph
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({
  item,
  active,
  onClick,
  q,
}: {
  item: Item;
  active: boolean;
  onClick: () => void;
  q: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-[9px] px-3.5 py-[9px] text-left transition',
        active ? 'bg-rowhover shadow-[inset_3px_0_0_var(--acc)]' : 'hover:bg-rowhover',
      )}
    >
      {item.kind === 'doc' ? (
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" className="flex-none">
          <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5Z" stroke={active ? 'var(--acc)' : 'var(--fg3)'} strokeWidth="1.2" />
        </svg>
      ) : (
        <>
          <span className="flex-none font-mono text-[13px] text-muted">&gt;</span>
          <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[7px] border border-capbd bg-capbg">
            <ActionGlyph icon={item.icon} />
          </span>
        </>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-fg">{highlight(item.label, q)}</div>
        {item.kind === 'doc' && item.hint && (
          <div className="truncate font-mono text-[11.5px] text-fg3">
            {item.hint.split('/').map((seg, i, arr) => (
              <span key={i}>
                {seg}
                {i < arr.length - 1 && <span className="text-muted"> / </span>}
              </span>
            ))}
          </div>
        )}
      </div>
      {item.meta && (
        <span className="flex-none whitespace-nowrap text-[11px] text-muted">{item.meta}</span>
      )}
      {item.shortcut && (
        <span className="flex-none rounded-md border border-capbd bg-capbg px-[7px] py-0.5 font-mono text-[10.5px] font-semibold text-fg2">
          {item.shortcut}
        </span>
      )}
      {active && !item.shortcut && !item.meta && (
        <span className="flex-none rounded-md border border-capbd bg-capbg px-[7px] py-0.5 text-[10px] font-semibold text-fg2">
          ↵
        </span>
      )}
    </button>
  );
}

function ActionGlyph({ icon }: { icon?: ActionIcon }) {
  if (icon === 'folder') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M1.6 4.4a1 1 0 0 1 1-1H6l1.4 1.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1V4.4Z" stroke="var(--acc)" strokeWidth="1.3" />
      </svg>
    );
  }
  if (icon === 'key') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="5.5" cy="5.5" r="3" stroke="var(--acc)" strokeWidth="1.3" />
        <path d="M7.7 7.7l5 5M11 11l1.5-1.5M12.5 12.5l1-1" stroke="var(--acc)" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 3.5v9M3.5 8h9" stroke="var(--acc)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-capbd bg-panel px-1.5 py-px text-[10.5px] font-semibold text-fg2">
      {children}
    </span>
  );
}
