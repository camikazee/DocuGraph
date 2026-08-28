'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  FRONTMATTER_FIELD_TYPES,
  createFrontmatterSchema,
  deleteFrontmatterSchema,
  updateFrontmatterSchema,
  type FrontmatterField,
  type FrontmatterSchema,
  type FrontmatterSchemaInput,
} from '@/lib/api/frontmatter-schemas';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';

interface FrontmatterSchemaManagerProps {
  workspaceId: string;
  schemas: FrontmatterSchema[];
  open: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

const emptyField = (): FrontmatterField => ({
  key: '', label: '', type: 'text', required: false, options: [], defaultValue: '',
});
const emptyForm = (): FrontmatterSchemaInput => ({
  name: '', description: '', fields: [emptyField()],
});

export function FrontmatterSchemaManager({
  workspaceId,
  schemas,
  open,
  onClose,
  onChanged,
}: FrontmatterSchemaManagerProps) {
  const [form, setForm] = useState<FrontmatterSchemaInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setForm(emptyForm());
      setEditingId(null);
      setError('');
    }
  }, [open]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setError('');
  };

  const close = () => {
    if (busy) return;
    resetForm();
    onClose();
  };

  const updateField = (index: number, change: Partial<FrontmatterField>) => {
    setForm((current) => ({
      ...current,
      fields: current.fields.map((field, position) =>
        position === index ? { ...field, ...change } : field,
      ),
    }));
    setError('');
  };

  const edit = (schema: FrontmatterSchema) => {
    if (schema.builtIn) return;
    setEditingId(schema.id);
    setForm({
      name: schema.name,
      description: schema.description,
      fields: schema.fields.map((field) => ({ ...field, options: [...field.options] })),
    });
    setError('');
  };

  const validate = (): string => {
    if (!form.name.trim()) return 'Schema name is required';
    if (form.fields.length === 0) return 'Add at least one field';
    if (form.fields.some((field) => !field.key.trim() || !field.label.trim())) {
      return 'Every field needs a key and label';
    }
    if (form.fields.some((field) => field.type === 'select' && field.options.length === 0)) {
      return 'Select fields need at least one option';
    }
    return '';
  };

  const save = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    const input: FrontmatterSchemaInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      fields: form.fields.map((field) => ({
        ...field,
        key: field.key.trim(),
        label: field.label.trim(),
        options: field.type === 'select'
          ? field.options.map((option) => option.trim()).filter(Boolean)
          : [],
      })),
    };
    if (input.fields.some((field) => field.type === 'select' && field.options.length === 0)) {
      setError('Select fields need at least one option');
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (editingId) await updateFrontmatterSchema(workspaceId, editingId, input);
      else await createFrontmatterSchema(workspaceId, input);
      resetForm();
      await onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Schema action failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (schema: FrontmatterSchema) => {
    if (schema.builtIn || !window.confirm(`Delete schema "${schema.name}"? Existing document frontmatter will not change.`)) return;
    setBusy(true);
    setError('');
    try {
      await deleteFrontmatterSchema(workspaceId, schema.id);
      if (editingId === schema.id) resetForm();
      await onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Schema action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Manage frontmatter schemas"
      size="lg"
      onSubmit={() => void save()}
      submitLabel={editingId ? 'Save changes' : 'Create schema'}
      submitting={busy}
    >
      <div className="grid max-h-[68vh] gap-5 overflow-y-auto pr-1">
        <section aria-labelledby="available-schemas-heading">
          <h3 id="available-schemas-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg3">Available schemas</h3>
          <div className="grid gap-2">
            {schemas.map((schema) => (
              <SchemaRow
                key={schema.id}
                schema={schema}
                disabled={busy}
                onEdit={schema.builtIn ? undefined : () => edit(schema)}
                onDelete={schema.builtIn ? undefined : () => void remove(schema)}
              />
            ))}
            {schemas.length === 0 && <p className="text-xs text-fg3">No schemas are available yet.</p>}
          </div>
        </section>

        <section aria-labelledby="schema-form-heading" className="grid gap-3 border-t border-line2 pt-4">
          <div className="flex items-center gap-3">
            <h3 id="schema-form-heading" className="text-xs font-semibold uppercase tracking-wide text-fg3">
              {editingId ? 'Edit workspace schema' : 'New workspace schema'}
            </h3>
            {editingId && <Button type="button" variant="secondary" className="ml-auto px-2.5 py-1 text-xs" onClick={resetForm} disabled={busy}>Cancel edit</Button>}
          </div>
          <Input label="Schema name" value={form.name} onChange={(name) => { setForm((current) => ({ ...current, name })); setError(''); }} />
          <Input label="Description" value={form.description} onChange={(description) => { setForm((current) => ({ ...current, description })); setError(''); }} />

          <div className="grid gap-3">
            {form.fields.map((field, index) => (
              <fieldset key={index} aria-label={`Field ${index + 1}`} className="grid gap-3 rounded-lg border border-line2 bg-card p-3">
                <legend className="px-1 text-xs font-semibold text-fg2">Field {index + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Key" value={field.key} onChange={(key) => updateField(index, { key })} />
                  <Input label="Label" value={field.label} onChange={(label) => updateField(index, { label })} />
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-fg3">Type</span>
                    <select
                      value={field.type}
                      onChange={(event) => updateField(index, { type: event.target.value as FrontmatterField['type'], options: event.target.value === 'select' ? field.options : [] })}
                      className="rounded-[10px] border border-inputbd bg-card px-3.5 py-2.5 text-sm text-fg outline-none focus:border-acc focus:ring-2 focus:ring-accsoft"
                    >
                      {FRONTMATTER_FIELD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <Input label="Default value" value={field.defaultValue} onChange={(defaultValue) => updateField(index, { defaultValue })} />
                </div>
                {field.type === 'select' && (
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-fg3">Options</span>
                    <textarea
                      aria-label="Options"
                      value={field.options.join('\n')}
                      onChange={(event) => updateField(index, { options: event.target.value.split('\n') })}
                      rows={4}
                      className="rounded-[10px] border border-inputbd bg-card px-3.5 py-2.5 text-sm text-fg outline-none focus:border-acc focus:ring-2 focus:ring-accsoft"
                    />
                    <span className="text-xs text-fg3">One option per line</span>
                  </label>
                )}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-fg2">
                    <input type="checkbox" checked={field.required} onChange={(event) => updateField(index, { required: event.target.checked })} />
                    Required
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    className="ml-auto px-2.5 py-1 text-xs"
                    disabled={busy}
                    onClick={() => { setForm((current) => ({ ...current, fields: current.fields.filter((_, position) => position !== index) })); setError(''); }}
                  >
                    Remove {field.label || field.key || `field ${index + 1}`}
                  </Button>
                </div>
              </fieldset>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || form.fields.length >= 24}
            onClick={() => { setForm((current) => ({ ...current, fields: [...current.fields, emptyField()] })); setError(''); }}
          >
            Add field
          </Button>
          <p aria-live="polite" className="min-h-5 text-xs text-red-400">{error}</p>
        </section>
      </div>
    </Modal>
  );
}

function SchemaRow({ schema, disabled, onEdit, onDelete }: { schema: FrontmatterSchema; disabled: boolean; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line2 bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{schema.name}</p>
        <p className="truncate text-xs text-fg3">{schema.builtIn ? 'Built-in · Read-only' : schema.description || 'Workspace'}</p>
      </div>
      {onEdit && <button type="button" onClick={onEdit} disabled={disabled} aria-label={`Edit ${schema.name}`} className="text-xs font-semibold text-accfg disabled:opacity-60">Edit</button>}
      {onDelete && <button type="button" onClick={onDelete} disabled={disabled} aria-label={`Delete ${schema.name}`} className="text-xs font-semibold text-red-400 disabled:opacity-60">Delete</button>}
    </div>
  );
}
