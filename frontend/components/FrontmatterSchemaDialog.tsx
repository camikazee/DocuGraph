'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  FrontmatterField,
  FrontmatterSchema,
} from '@/lib/api/frontmatter-schemas';
import {
  applyFrontmatterSchema,
  readFrontmatterValues,
  type FrontmatterApplication,
} from '@/lib/frontmatterSchema';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

interface FrontmatterSchemaDialogProps {
  schemas: FrontmatterSchema[];
  content: string;
  open: boolean;
  onClose: () => void;
  onApply: (result: FrontmatterApplication) => void;
  onManage: () => void;
  canManage: boolean;
}

export function FrontmatterSchemaDialog({
  schemas,
  content,
  open,
  onClose,
  onApply,
  onManage,
  canManage,
}: FrontmatterSchemaDialogProps) {
  const [selectedId, setSelectedId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const selected = useMemo(
    () => schemas.find((schema) => schema.id === selectedId) ?? schemas[0],
    [schemas, selectedId],
  );
  const builtIns = schemas.filter((schema) => schema.builtIn);
  const custom = schemas.filter((schema) => !schema.builtIn);

  useEffect(() => {
    if (!open) return;
    const next = schemas.find((schema) => schema.id === selectedId) ?? schemas[0];
    if (!next) {
      setSelectedId('');
      setValues({});
      return;
    }
    setSelectedId(next.id);
    setValues(readFrontmatterValues(content, next.fields));
    setError('');
  }, [content, open, schemas, selectedId]);

  const selectSchema = (id: string) => {
    const schema = schemas.find((candidate) => candidate.id === id);
    setSelectedId(id);
    setValues(schema ? readFrontmatterValues(content, schema.fields) : {});
    setError('');
  };

  const changeValue = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setError('');
  };

  const apply = () => {
    if (!selected) {
      setError('Choose a frontmatter schema');
      return;
    }
    try {
      onApply(applyFrontmatterSchema(content, selected.fields, values));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Frontmatter validation failed');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Frontmatter"
      size="lg"
      footer={
        <div className="flex items-center gap-2.5">
          {canManage && (
            <Button type="button" variant="secondary" onClick={onManage}>
              Manage schemas
            </Button>
          )}
          <div className="ml-auto flex gap-2.5">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={apply} disabled={!selected}>
              Apply frontmatter
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid max-h-[68vh] gap-4 overflow-y-auto pr-1">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-fg3">Schema</span>
          <select
            value={selected?.id ?? ''}
            onChange={(event) => selectSchema(event.target.value)}
            className="rounded-[10px] border border-inputbd bg-card px-3.5 py-2.5 text-sm text-fg outline-none transition focus:border-acc focus:ring-2 focus:ring-accsoft"
          >
            {schemas.length === 0 && <option value="">No schemas available</option>}
            {builtIns.length > 0 && (
              <optgroup label="Built-in schemas">
                {builtIns.map((schema) => <option key={schema.id} value={schema.id}>{schema.name}</option>)}
              </optgroup>
            )}
            {custom.length > 0 && (
              <optgroup label="Workspace schemas">
                {custom.map((schema) => <option key={schema.id} value={schema.id}>{schema.name}</option>)}
              </optgroup>
            )}
          </select>
        </label>

        {selected?.description && <p className="text-xs text-fg3">{selected.description}</p>}
        {selected?.fields.map((field) => (
          <FieldControl
            key={field.key}
            field={field}
            value={values[field.key] ?? field.defaultValue}
            onChange={(value) => changeValue(field.key, value)}
          />
        ))}
        <p aria-live="polite" className="min-h-5 text-xs text-red-400">{error}</p>
      </div>
    </Modal>
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FrontmatterField;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputClass = 'rounded-[10px] border border-inputbd bg-card px-3.5 py-2.5 text-sm text-fg outline-none transition focus:border-acc focus:ring-2 focus:ring-accsoft';

  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-fg3">{field.label}</span>
      {field.type === 'boolean' ? (
        <select required={field.required} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Not set</option>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      ) : field.type === 'select' ? (
        <select required={field.required} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
          {!field.required && <option value="">Not set</option>}
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input
          className={inputClass}
          type={field.type === 'number' || field.type === 'date' ? field.type : 'text'}
          required={field.required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.type === 'list' && <span className="text-xs text-fg3">Comma-separated values</span>}
    </label>
  );
}
