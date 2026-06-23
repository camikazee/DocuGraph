import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithWorkspace } from '../interfaces/request-with-workspace.interface';

/** Aktywny workspace_id rozwiązany przez WorkspaceGuard. */
export const ActiveWorkspace = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<RequestWithWorkspace>();
    return req.workspaceId;
  },
);
