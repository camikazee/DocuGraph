'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  createDocumentSnippet,
  deleteDocumentSnippet,
  updateDocumentSnippet,
  type DocumentSnippet,
  type DocumentSnippetInput,
} from '@/lib/api/document-snippets';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';

interface DocumentSnippetManagerProps {
  workspaceId: string;
  snippets: DocumentSnippet[];
  open: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

const EMPTY_FORM: DocumentSnippetInput = {
  name: '',
  description: '',
  contentRaw: '',
};

export function DocumentSnippetManager({
  workspaceId,
  snippets,
  open,
  onClose,
  onChanged,
}: DocumentSnippetManagerProps) {
  const [form, setForm] = useState<DocumentSnippetInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const builtIns = snippets.filter((snippet) => snippet.builtIn);
  const custom = snippets.filter((snippet) => !snippet.builtIn);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setEditingId(null);
      setError('');
    }
  }, [open]);

  const change = (field: keyof DocumentSnippetInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError('');
  };

  const close = () => {
    if (busy) return;
    resetForm();
    onClose();
  };

  const edit = (snippet: DocumentSnippet) => {
    if (snippet.builtIn) return;
    setEditingId(snippet.id);
    setForm({
      name: snippet.name,
      description: snippet.description,
      contentRaw: snippet.contentRaw,
    });
    setError('');
  };

  const save = async () => {
    if (!form.name.trim() || !form.contentRaw) {
      setError('Name and Markdown are required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const input = {
        name: form.name.trim(),
        description: form.description.trim(),
        contentRaw: form.contentRaw,
      };
      if (editingId) {
        await updateDocumentSnippet(workspaceId, editingId, input);
      } else {
        await createDocumentSnippet(workspaceId, input);
      }
      resetForm();
      await onChanged();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'Snippet action failed',
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (snippet: DocumentSnippet) => {
    if (
      snippet.builtIn ||
      !window.confirm(
        `Delete snippet "${snippet.name}"? Documents using it will not change.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await deleteDocumentSnippet(workspaceId, snippet.id);
      if (editingId === snippet.id) resetForm();
      await onChanged();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'Snippet action failed',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Manage snippets"
      size="lg"
      onSubmit={() => void save()}
      submitLabel={editingId ? 'Save changes' : 'Create snippet'}
      submitting={busy}
    >
      <div className="grid max-h-[68vh] gap-5 overflow-y-auto pr-1">
        <section aria-labelledby="available-snippets-heading">
          <h3
            id="available-snippets-heading"
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg3"
          >
            Available snippets
          </h3>
          <div className="grid gap-2">
            {builtIns.map((snippet) => (
              <SnippetRow key={snippet.id} snippet={snippet} />
            ))}
            {custom.map((snippet) => (
              <SnippetRow
                key={snippet.id}
                snippet={snippet}
                disabled={busy}
                onEdit={() => edit(snippet)}
                onDelete={() => void remove(snippet)}
              />
            ))}
            {custom.length === 0 && (
              <p className="text-xs text-fg3">
                No workspace snippets yet. Built-ins remain available to
                everyone.
              </p>
            )}
          </div>
        </section>

        <section
          aria-labelledby="snippet-form-heading"
          className="grid gap-3 border-t border-line2 pt-4"
        >
          <div className="flex items-center gap-3">
            <h3
              id="snippet-form-heading"
              className="text-xs font-semibold uppercase tracking-wide text-fg3"
            >
              {editingId ? 'Edit workspace snippet' : 'New workspace snippet'}
            </h3>
            {editingId && (
              <Button
                type="button"
                variant="secondary"
                className="ml-auto px-2.5 py-1 text-xs"
                onClick={resetForm}
                disabled={busy}
              >
                Cancel edit
              </Button>
            )}
          </div>
          <Input
            label="Snippet name"
            value={form.name}
            onChange={(value) => change('name', value)}
            placeholder="Important warning"
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(value) => change('description', value)}
            placeholder="When to use this fragment"
          />
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-fg3">
              Snippet Markdown
            </span>
            <textarea
              value={form.contentRaw}
              onChange={(event) => change('contentRaw', event.target.value)}
              rows={8}
              className="rounded-[10px] border border-inputbd bg-card px-3.5 py-2.5 font-mono text-sm text-fg outline-none transition focus:border-acc focus:ring-2 focus:ring-accsoft"
            />
          </label>
          <p aria-live="polite" className="min-h-5 text-xs text-red-400">
            {error}
          </p>
        </section>
      </div>
    </Modal>
  );
}

function SnippetRow({
  snippet,
  disabled = false,
  onEdit,
  onDelete,
}: {
  snippet: DocumentSnippet;
  disabled?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line2 bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{snippet.name}</p>
        <p className="truncate text-xs text-fg3">
          {snippet.builtIn ? 'Built-in' : snippet.description || 'Workspace'}
        </p>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          aria-label={`Edit ${snippet.name}`}
          className="text-xs font-semibold text-accfg disabled:opacity-60"
        >
          Edit
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          aria-label={`Delete ${snippet.name}`}
          className="text-xs font-semibold text-red-400 disabled:opacity-60"
        >
          Delete
        </button>
      )}
    </div>
  );
}
