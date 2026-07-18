'use client';

import { useRef, useState } from 'react';

export interface MentionMember {
  userId: string;
  name: string;
}

/**
 * Textarea z autouzupełnianiem wzmianek: wpisz „@", by wybrać członka workspace.
 * Wybór wstawia „@Imię " do treści i zgłasza uuid przez `onMentionsChange`.
 * Wzmianki są uzgadniane z treścią (usunięcie „@Imię" cofa wzmiankę).
 */
export function MentionTextarea({
  value,
  onChange,
  onMentionsChange,
  members,
  placeholder,
  rows = 3,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onMentionsChange: (uuids: string[]) => void;
  members: MentionMember[];
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const selected = useRef<Map<string, string>>(new Map()); // uuid -> name
  const [query, setQuery] = useState<string | null>(null);

  function reconcile(text: string) {
    for (const [uuid, name] of selected.current) {
      if (!text.includes(`@${name}`)) selected.current.delete(uuid);
    }
    onMentionsChange([...selected.current.keys()]);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    onChange(v);
    const caret = e.target.selectionStart ?? v.length;
    const m = v.slice(0, caret).match(/@(\w*)$/);
    setQuery(m ? m[1] : null);
    reconcile(v);
  }

  function pick(member: MentionMember) {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@(\w*)$/, `@${member.name} `);
    const next = before + value.slice(caret);
    onChange(next);
    selected.current.set(member.userId, member.name);
    onMentionsChange([...selected.current.keys()]);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  }

  const matches =
    query !== null
      ? members
          .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 6)
      : [];

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />
      {matches.length > 0 && (
        <div className="absolute inset-x-0 z-30 mt-1 overflow-hidden rounded-lg border border-line bg-panel shadow-xl">
          {matches.map((m) => (
            <button
              key={m.userId}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-fg2 transition hover:bg-rowhover"
            >
              <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-acc/20 text-[10px] font-bold text-accfg">
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              @{m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
