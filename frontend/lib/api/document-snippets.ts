import { apiJson, apiVoid } from '../api';

export interface DocumentSnippet {
  id: string;
  name: string;
  description: string;
  contentRaw: string;
  builtIn: boolean;
}

export interface DocumentSnippetInput {
  name: string;
  description: string;
  contentRaw: string;
}

export type DocumentSnippetUpdate = Partial<DocumentSnippetInput>;

const collectionPath = (workspaceId: string) =>
  `/workspaces/${workspaceId}/document-snippets`;

const itemPath = (workspaceId: string, id: string) =>
  `${collectionPath(workspaceId)}/${encodeURIComponent(id)}`;

export function listDocumentSnippets(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<DocumentSnippet[]> {
  return apiJson(collectionPath(workspaceId), { signal });
}

export function createDocumentSnippet(
  workspaceId: string,
  input: DocumentSnippetInput,
): Promise<DocumentSnippet> {
  return apiJson(collectionPath(workspaceId), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateDocumentSnippet(
  workspaceId: string,
  id: string,
  input: DocumentSnippetUpdate,
): Promise<DocumentSnippet> {
  return apiJson(itemPath(workspaceId, id), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteDocumentSnippet(
  workspaceId: string,
  id: string,
): Promise<void> {
  return apiVoid(itemPath(workspaceId, id), { method: 'DELETE' });
}
