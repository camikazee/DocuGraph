/**
 * Role użytkownika w obrębie workspace (RBAC).
 * Hierarchia uprawnień: OWNER > EDITOR > VIEWER.
 */
export enum Role {
  Owner = 'owner',
  Editor = 'editor',
  Viewer = 'viewer',
}

export const ROLE_VALUES: readonly Role[] = Object.values(Role);
