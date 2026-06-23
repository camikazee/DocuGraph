import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { isUuid } from '../uuid.util';
import { ApiKeysService } from '../../api-keys/api-keys.service';
import { WorkspacesService } from '../../workspaces/workspaces.service';
import { Role } from '../enums/role.enum';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { RequestWithWorkspace } from '../interfaces/request-with-workspace.interface';

const API_KEY_PREFIX = 'dg_live_';

/**
 * Jednolite uwierzytelnianie dla endpointów dostępnych zarówno z UI (JWT),
 * jak i z CI/CD (token dg_live_…). Ustawia kontekst workspace + rolę.
 * - JWT: workspace ze ścieżki `:id` / nagłówka X-Workspace-Id + rola z membership.
 * - token CI: workspace z klucza, rola Editor.
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly apiKeysService: ApiKeysService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithWorkspace>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = auth.slice('Bearer '.length);

    return token.startsWith(API_KEY_PREFIX)
      ? this.authenticateApiKey(req, token)
      : this.authenticateJwt(req, token);
  }

  private async authenticateApiKey(
    req: RequestWithWorkspace,
    token: string,
  ): Promise<boolean> {
    const ctx = await this.apiKeysService.validate(token);
    const pathWs = req.params?.id;
    if (pathWs) {
      const internalId = await this.workspacesService.resolveId(pathWs);
      if (!internalId || internalId !== ctx.workspaceId) {
        throw new ForbiddenException('API key does not match this workspace');
      }
      req.params.id = internalId; // downstream @Param('id') = internal _id
    }
    req.workspaceId = ctx.workspaceId;
    req.workspaceRole = Role.Editor;
    req.authType = 'apiKey';
    req.user = { userId: '' };
    return true;
  }

  private async authenticateJwt(
    req: RequestWithWorkspace,
    token: string,
  ): Promise<boolean> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.secret'),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
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
      throw new ForbiddenException('Access denied to this workspace');
    }
    const membership = await this.workspacesService.findMembership(
      internalId,
      payload.sub,
    );
    if (!membership) {
      throw new ForbiddenException('Access denied to this workspace');
    }

    req.user = { userId: payload.sub };
    if (req.params) req.params.id = internalId; // downstream @Param('id') = internal _id
    req.workspaceId = internalId;
    req.workspaceRole = membership.role;
    req.authType = 'jwt';
    return true;
  }
}
