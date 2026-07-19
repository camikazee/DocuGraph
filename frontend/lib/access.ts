import { apiFetch } from './api';

export type AccessLevel = 'none' | 'read' | 'write';
export type SubjectType = 'all' | 'group' | 'user';

export interface AccessGroup {
  id: string;
  name: string;
  members: { userId: string; name: string }[];
}

export interface AccessRule {
  id: string;
  path: string;
  subjectType: SubjectType;
  subjectId: string | null;
  subjectName: string;
  level: AccessLevel;
}

export interface RuleInput {
  path: string;
  subjectType: SubjectType;
  subjectId?: string | null;
  level: AccessLevel;
}

/** Typed wrappers over the Owner-only access-control endpoints. */
export const accessApi = {
  listGroups: (ws: string) =>
    apiFetch<AccessGroup[]>(`/workspaces/${ws}/groups`),
  createGroup: (ws: string, name: string) =>
    apiFetch<AccessGroup[]>(`/workspaces/${ws}/groups`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  renameGroup: (ws: string, groupId: string, name: string) =>
    apiFetch<AccessGroup[]>(`/workspaces/${ws}/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteGroup: (ws: string, groupId: string) =>
    apiFetch<AccessGroup[]>(`/workspaces/${ws}/groups/${groupId}`, {
      method: 'DELETE',
    }),
  setGroupMembers: (ws: string, groupId: string, members: string[]) =>
    apiFetch<AccessGroup[]>(`/workspaces/${ws}/groups/${groupId}/members`, {
      method: 'PUT',
      body: JSON.stringify({ members }),
    }),

  listRules: (ws: string) =>
    apiFetch<AccessRule[]>(`/workspaces/${ws}/access-rules`),
  upsertRule: (ws: string, input: RuleInput) =>
    apiFetch<AccessRule[]>(`/workspaces/${ws}/access-rules`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  deleteRule: (ws: string, ruleId: string) =>
    apiFetch<AccessRule[]>(`/workspaces/${ws}/access-rules/${ruleId}`, {
      method: 'DELETE',
    }),
};

const LEVEL_LABEL: Record<AccessLevel, string> = {
  none: 'Hidden',
  read: 'Read',
  write: 'Write',
};

export function levelLabel(level: AccessLevel): string {
  return LEVEL_LABEL[level];
}
