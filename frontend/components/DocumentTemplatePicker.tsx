'use client';

import { useId } from 'react';
import type { DocumentTemplate } from '@/lib/api/document-templates';

interface DocumentTemplatePickerProps {
  templates: DocumentTemplate[];
  value: string;
  onSelect: (template: DocumentTemplate | null) => void;
  disabled?: boolean;
}

export function DocumentTemplatePicker({
  templates,
  value,
  onSelect,
  disabled = false,
}: DocumentTemplatePickerProps) {
  const builtIns = templates.filter((template) => template.builtIn);
  const custom = templates.filter((template) => !template.builtIn);
  const selected = templates.find((template) => template.id === value);
  const selectId = useId();
  const descriptionId = useId();

  return (
    <div className="grid gap-1.5">
      <label htmlFor={selectId} className="text-xs font-medium text-fg3">
        Start from template
      </label>
      <select
        id={selectId}
        aria-describedby={descriptionId}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const template = templates.find(
            (candidate) => candidate.id === event.target.value,
          );
          onSelect(template ?? null);
        }}
        className="rounded-[10px] border border-inputbd bg-card px-3.5 py-2.5 text-sm text-fg outline-none transition focus:border-acc focus:ring-2 focus:ring-accsoft disabled:opacity-60"
      >
        <option value="">Blank document</option>
        {builtIns.length > 0 && (
          <optgroup label="Built-in templates">
            {builtIns.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </optgroup>
        )}
        {custom.length > 0 && (
          <optgroup label="Workspace templates">
            {custom.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <span
        id={descriptionId}
        aria-live="polite"
        className="min-h-4 text-xs text-fg3"
      >
        {selected?.description ??
          (disabled ? 'Loading templates…' : 'Start with an empty Markdown file.')}
      </span>
    </div>
  );
}
