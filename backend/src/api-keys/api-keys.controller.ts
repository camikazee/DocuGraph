import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKeysService } from './api-keys.service';
import { AuditService } from '../audit/audit.service';

@Controller('workspaces/:id/api-keys')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@Roles(Role.Owner)
export class ApiKeysController {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  async create(
    @Param('id') workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    const key = await this.apiKeysService.create(
      workspaceId,
      user.userId,
      dto.name,
    );
    await this.audit.log({
      workspaceId,
      actorId: user.userId,
      action: 'apikey.created',
      target: dto.name,
    });
    return key;
  }

  @Get()
  list(@Param('id') workspaceId: string) {
    return this.apiKeysService.list(workspaceId);
  }

  @Delete(':keyId')
  @HttpCode(204)
  async revoke(
    @Param('id') workspaceId: string,
    @Param('keyId') keyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.apiKeysService.revoke(workspaceId, keyId);
    await this.audit.log({
      workspaceId,
      actorId: user.userId,
      action: 'apikey.revoked',
      target: keyId,
    });
  }
}
