import { apiJson, apiVoid } from '../api';

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  suggestedPath: string;
  contentRaw: string;
  builtIn: boolean;
}

export interface DocumentTemplateInput {
  name: string;
  description: string;
  suggestedPath: string;
  contentRaw: string;
}

export type DocumentTemplateUpdate = Partial<DocumentTemplateInput>;

const collectionPath = (workspaceId: string) =>
  `/workspaces/${workspaceId}/document-templates`;

const itemPath = (workspaceId: string, id: string) =>
  `${collectionPath(workspaceId)}/${encodeURIComponent(id)}`;

export function listDocumentTemplates(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<DocumentTemplate[]> {
  return apiJson(collectionPath(workspaceId), { signal });
}

export function createDocumentTemplate(
  workspaceId: string,
  input: DocumentTemplateInput,
): Promise<DocumentTemplate> {
  return apiJson(collectionPath(workspaceId), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateDocumentTemplate(
  workspaceId: string,
  id: string,
  input: DocumentTemplateUpdate,
): Promise<DocumentTemplate> {
  return apiJson(itemPath(workspaceId, id), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteDocumentTemplate(
  workspaceId: string,
  id: string,
): Promise<void> {
  return apiVoid(itemPath(workspaceId, id), { method: 'DELETE' });
}
