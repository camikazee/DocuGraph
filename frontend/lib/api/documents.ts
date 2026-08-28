import { apiBlob, apiForm, apiVoid } from '../api';

export type DocumentExportKind = 'html' | 'zip' | 'source';

const EXPORTS: Record<
  DocumentExportKind,
  { path: string; filename: string }
> = {
  html: { path: 'export.html', filename: 'documentation.html' },
  zip: { path: 'export.zip', filename: 'documentation.zip' },
  source: {
    path: 'export/source.zip',
    filename: 'documentation-source.zip',
  },
};

export async function exportDocuments(
  workspaceId: string,
  kind: DocumentExportKind,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string }> {
  const spec = EXPORTS[kind];
  const blob = await apiBlob(
    `/workspaces/${workspaceId}/documents/${spec.path}`,
    { signal },
  );
  return { blob, filename: spec.filename };
}

export function importDocumentsZip(
  workspaceId: string,
  file: File,
  signal?: AbortSignal,
): Promise<{ imported: number; skipped: number }> {
  const form = new FormData();
  form.append('file', file);
  return apiForm(`/workspaces/${workspaceId}/documents/import.zip`, form, {
    method: 'POST',
    signal,
  });
}

export function recordDocumentRead(
  workspaceId: string,
  path: string,
  durationMs: number,
): Promise<void> {
  return apiVoid(`/workspaces/${workspaceId}/documents/events/read`, {
    method: 'POST',
    keepalive: true,
    body: JSON.stringify({ path, durationMs }),
  });
}
