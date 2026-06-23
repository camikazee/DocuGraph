import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { RequestWithWorkspace } from '../interfaces/request-with-workspace.interface';

/**
 * Egzekwuje role wymagane przez @Roles(). Czyta rolę ustawioną przez
 * WorkspaceGuard, więc musi działać PO nim.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // brak ograniczenia — wystarczy członkostwo (WorkspaceGuard)
    }

    const req = context.switchToHttp().getRequest<RequestWithWorkspace>();
    if (!requiredRoles.includes(req.workspaceRole)) {
      throw new ForbiddenException('Insufficient role for this action');
    }
    return true;
  }
}
