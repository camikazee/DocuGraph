import { Request } from 'express';
import { Role } from '../enums/role.enum';
import { AuthenticatedUser } from './jwt-payload.interface';

/**
 * Request po przejściu JwtAuthGuard + WorkspaceGuard.
 * `workspaceId` i `workspaceRole` ustawia WorkspaceGuard.
 */
export interface RequestWithWorkspace extends Request {
  user: AuthenticatedUser;
  workspaceId: string;
  workspaceRole: Role;
  /** Sposób uwierzytelnienia — 'jwt' (człowiek) lub 'apiKey' (token CI/CD). */
  authType?: 'jwt' | 'apiKey';
}
