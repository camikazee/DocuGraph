import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

/**
 * Ogranicza dostęp do endpointu do wskazanych ról workspace.
 * Działa razem z WorkspaceGuard (ustawia rolę) i RolesGuard (sprawdza).
 * Przykład: `@Roles(Role.Owner)`.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
