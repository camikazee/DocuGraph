import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isUuid } from '../uuid.util';
import { WorkspacesService } from '../../workspaces/workspaces.service';
import { RequestWithWorkspace } from '../interfaces/request-with-workspace.interface';

/**
 * Rozwiązuje aktywny workspace i egzekwuje członkostwo (izolacja tenantów).
 * Źródło workspace_id: parametr ścieżki `:id` lub nagłówek `X-Workspace-Id`.
 * Musi działać PO JwtAuthGuard (potrzebuje req.user).
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly workspacesService: WorkspacesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithWorkspace>();

    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('Not authenticated');
    }

    const workspaceUuid =
      (req.params?.id as string | undefined) ??
      (req.headers['x-workspace-id'] as string | undefined);

    if (!workspaceUuid) {
      throw new BadRequestException('Missing workspace identifier');
    }
    if (!isUuid(workspaceUuid)) {
      throw new BadRequestException('Invalid workspace identifier');
    }

    const internalId = await this.workspacesService.resolveId(workspaceUuid);
    if (!internalId) {
      // Nie ujawniamy istnienia workspace — brak/niedopasowanie = 403.
      throw new ForbiddenException('Access denied to this workspace');
    }
    const membership = await this.workspacesService.findMembership(
      internalId,
      userId,
    );
    if (!membership) {
      throw new ForbiddenException('Access denied to this workspace');
    }

    if (req.params) req.params.id = internalId; // downstream @Param('id') = internal _id
    req.workspaceId = internalId;
    req.workspaceRole = membership.role;
    return true;
  }
}
