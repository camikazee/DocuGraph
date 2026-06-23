import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { RequestWithWorkspace } from '../../common/interfaces/request-with-workspace.interface';
import { ApiKeysService } from '../api-keys.service';

const API_KEY_PREFIX = 'dg_live_';

/**
 * Uwierzytelnia żądania CI/CD tokenem `dg_live_…` w nagłówku Authorization.
 * Ustawia kontekst workspace na podstawie samego klucza; token działa
 * z uprawnieniami Editor (zapis dokumentów w docelowym module).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithWorkspace>();
    const auth = req.headers.authorization;

    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing API key');
    }
    const token = auth.slice('Bearer '.length);
    if (!token.startsWith(API_KEY_PREFIX)) {
      throw new UnauthorizedException('Not an API key');
    }

    const ctx = await this.apiKeysService.validate(token);
    // /ci jest publiczne — zwracamy uuid, nie wewnętrzne _id.
    req.workspaceId = ctx.workspaceUuid;
    req.workspaceRole = Role.Editor;
    return true;
  }
}
