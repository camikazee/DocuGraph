'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { DocumentSnippet } from '@/lib/api/document-snippets';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

interface DocumentSnippetPickerProps {
  snippets: DocumentSnippet[];
  open: boolean;
  onClose: () => void;
  onInsert: (snippet: DocumentSnippet) => void;
  onManage: () => void;
  canManage: boolean;
}

export function DocumentSnippetPicker({
  snippets,
  open,
  onClose,
  onInsert,
  onManage,
  canManage,
}: DocumentSnippetPickerProps) {
  const [query, setQuery] = useState('');
  const searchId = useId();

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return snippets;
    return snippets.filter(
      (snippet) =>
        snippet.name.toLowerCase().includes(normalized) ||
        snippet.description.toLowerCase().includes(normalized),
    );
  }, [query, snippets]);
  const builtIns = filtered.filter((snippet) => snippet.builtIn);
  const custom = filtered.filter((snippet) => !snippet.builtIn);

  return (
    <Modal open={open} onClose={onClose} title="Insert snippet" size="lg">
      <div className="grid max-h-[68vh] gap-4 overflow-y-auto pr-1">
        <div className="flex items-end gap-2">
          <label htmlFor={searchId} className="grid min-w-0 flex-1 gap-1.5">
            <span className="text-xs font-medium text-fg3">
              Filter snippets
            </span>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or description…"
              className="rounded-[10px] border border-inputbd bg-card px-3.5 py-2.5 text-sm text-fg outline-none transition focus:border-acc focus:ring-2 focus:ring-accsoft"
            />
          </label>
          {canManage && (
            <Button type="button" variant="secondary" onClick={onManage}>
              Manage snippets
            </Button>
          )}
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-lg border border-line2 bg-card p-4 text-sm text-fg3">
            No snippets match this filter.
          </p>
        ) : (
          <>
            <SnippetSection
              title="Built-in snippets"
              snippets={builtIns}
              onInsert={onInsert}
            />
            <SnippetSection
              title="Workspace snippets"
              snippets={custom}
              onInsert={onInsert}
            />
          </>
        )}
      </div>
    </Modal>
  );
}

function SnippetSection({
  title,
  snippets,
  onInsert,
}: {
  title: string;
  snippets: DocumentSnippet[];
  onInsert: (snippet: DocumentSnippet) => void;
}) {
  if (snippets.length === 0) return null;
  return (
    <section aria-label={title} className="grid gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-fg3">
        {title}
      </h3>
      {snippets.map((snippet) => (
        <button
          key={snippet.id}
          type="button"
          onClick={() => onInsert(snippet)}
          aria-label={`Insert ${snippet.name}`}
          className="rounded-lg border border-line2 bg-card px-3 py-2.5 text-left transition hover:border-acc hover:bg-rowhover"
        >
          <span className="block text-sm font-semibold text-fg">
            {snippet.name}
          </span>
          <span className="mt-0.5 block text-xs text-fg3">
            {snippet.description || 'Workspace Markdown snippet'}
          </span>
        </button>
      ))}
    </section>
  );
}
