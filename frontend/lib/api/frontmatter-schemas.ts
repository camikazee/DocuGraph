import { apiJson, apiVoid } from '../api';

export const FRONTMATTER_FIELD_TYPES = [
  'text',
  'number',
  'boolean',
  'date',
  'select',
  'list',
] as const;

export type FrontmatterFieldType = (typeof FRONTMATTER_FIELD_TYPES)[number];

export interface FrontmatterField {
  key: string;
  label: string;
  type: FrontmatterFieldType;
  required: boolean;
  options: string[];
  defaultValue: string;
}

export interface FrontmatterSchema {
  id: string;
  name: string;
  description: string;
  fields: FrontmatterField[];
  builtIn: boolean;
}

export interface FrontmatterSchemaInput {
  name: string;
  description: string;
  fields: FrontmatterField[];
}

export type FrontmatterSchemaUpdate = Partial<FrontmatterSchemaInput>;

const collectionPath = (workspaceId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/frontmatter-schemas`;

const itemPath = (workspaceId: string, schemaId: string) =>
  `${collectionPath(workspaceId)}/${encodeURIComponent(schemaId)}`;

export function listFrontmatterSchemas(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<FrontmatterSchema[]> {
  return apiJson<FrontmatterSchema[]>(collectionPath(workspaceId), { signal });
}

export function createFrontmatterSchema(
  workspaceId: string,
  input: FrontmatterSchemaInput,
): Promise<FrontmatterSchema> {
  return apiJson<FrontmatterSchema>(collectionPath(workspaceId), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateFrontmatterSchema(
  workspaceId: string,
  schemaId: string,
  input: FrontmatterSchemaUpdate,
): Promise<FrontmatterSchema> {
  return apiJson<FrontmatterSchema>(itemPath(workspaceId, schemaId), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteFrontmatterSchema(
  workspaceId: string,
  schemaId: string,
): Promise<void> {
  return apiVoid(itemPath(workspaceId, schemaId), { method: 'DELETE' });
}
