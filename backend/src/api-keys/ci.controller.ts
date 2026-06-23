import { Controller, Get, UseGuards } from '@nestjs/common';
import { ActiveWorkspace } from '../common/decorators/workspace-role.decorator';
import { ApiKeyGuard } from './guards/api-key.guard';

/**
 * Endpointy dla integracji CI/CD (uwierzytelniane tokenem `dg_live_…`).
 * `whoami` służy do weryfikacji poprawności tokena i połączenia.
 */
@Controller('ci')
@UseGuards(ApiKeyGuard)
export class CiController {
  @Get('whoami')
  whoami(@ActiveWorkspace() workspaceId: string) {
    return { workspaceId, auth: 'apiKey' };
  }
}
