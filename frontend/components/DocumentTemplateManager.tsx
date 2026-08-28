'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  createDocumentTemplate,
  deleteDocumentTemplate,
  updateDocumentTemplate,
  type DocumentTemplate,
  type DocumentTemplateInput,
} from '@/lib/api/document-templates';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';

interface DocumentTemplateManagerProps {
  workspaceId: string;
  templates: DocumentTemplate[];
  open: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

const EMPTY_FORM: DocumentTemplateInput = {
  name: '',
  description: '',
  suggestedPath: '',
  contentRaw: '',
};

export function DocumentTemplateManager({
  workspaceId,
  templates,
  open,
  onClose,
  onChanged,
}: DocumentTemplateManagerProps) {
  const [form, setForm] = useState<DocumentTemplateInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const builtIns = templates.filter((template) => template.builtIn);
  const custom = templates.filter((template) => !template.builtIn);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setEditingId(null);
      setError('');
    }
  }, [open]);

  const change = (field: keyof DocumentTemplateInput, value: string) => {
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

  const edit = (template: DocumentTemplate) => {
    if (template.builtIn) return;
    setEditingId(template.id);
    setForm({
      name: template.name,
      description: template.description,
      suggestedPath: template.suggestedPath,
      contentRaw: template.contentRaw,
    });
    setError('');
  };

  const save = async () => {
    if (!form.name.trim() || !form.suggestedPath.trim() || !form.contentRaw) {
      setError('Name, suggested path, and Markdown are required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const input = {
        name: form.name.trim(),
        description: form.description.trim(),
        suggestedPath: form.suggestedPath.trim(),
        contentRaw: form.contentRaw,
      };
      if (editingId) {
        await updateDocumentTemplate(workspaceId, editingId, input);
      } else {
        await createDocumentTemplate(workspaceId, input);
      }
      resetForm();
      await onChanged();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'Template action failed',
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (template: DocumentTemplate) => {
    if (
      template.builtIn ||
      !window.confirm(
        `Delete template "${template.name}"? Documents already created from it will not change.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await deleteDocumentTemplate(workspaceId, template.id);
      if (editingId === template.id) resetForm();
      await onChanged();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'Template action failed',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Manage templates"
      size="lg"
      onSubmit={() => void save()}
      submitLabel={editingId ? 'Save changes' : 'Create template'}
      submitting={busy}
    >
      <div className="grid max-h-[68vh] gap-5 overflow-y-auto pr-1">
        <section aria-labelledby="available-templates-heading">
          <h3
            id="available-templates-heading"
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg3"
          >
            Available templates
          </h3>
          <div className="grid gap-2">
            {builtIns.map((template) => (
              <TemplateRow key={template.id} template={template} />
            ))}
            {custom.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                disabled={busy}
                onEdit={() => edit(template)}
                onDelete={() => void remove(template)}
              />
            ))}
            {custom.length === 0 && (
              <p className="text-xs text-fg3">
                No workspace templates yet. Built-ins remain available to
                everyone.
              </p>
            )}
          </div>
        </section>

        <section
          aria-labelledby="template-form-heading"
          className="grid gap-3 border-t border-line2 pt-4"
        >
          <div className="flex items-center gap-3">
            <h3
              id="template-form-heading"
              className="text-xs font-semibold uppercase tracking-wide text-fg3"
            >
              {editingId ? 'Edit workspace template' : 'New workspace template'}
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
            label="Template name"
            value={form.name}
            onChange={(value) => change('name', value)}
            placeholder="Incident runbook"
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(value) => change('description', value)}
            placeholder="When and how to use this template"
          />
          <Input
            label="Suggested path"
            value={form.suggestedPath}
            onChange={(value) => change('suggestedPath', value)}
            placeholder="ops/runbook.md"
          />
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-fg3">
              Template Markdown
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

function TemplateRow({
  template,
  disabled = false,
  onEdit,
  onDelete,
}: {
  template: DocumentTemplate;
  disabled?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line2 bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{template.name}</p>
        <p className="truncate text-xs text-fg3">
          {template.builtIn ? 'Built-in' : template.suggestedPath}
        </p>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          aria-label={`Edit ${template.name}`}
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
          aria-label={`Delete ${template.name}`}
          className="text-xs font-semibold text-red-400 disabled:opacity-60"
        >
          Delete
        </button>
      )}
    </div>
  );
}
