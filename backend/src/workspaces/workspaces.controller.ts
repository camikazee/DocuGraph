import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
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
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { WorkspacesService } from './workspaces.service';
import { AuditService } from '../audit/audit.service';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkspaceDto,
  ) {
    const workspace = await this.workspacesService.createForUser(
      user.userId,
      dto.name,
    );
    return {
      id: workspace.uuid,
      name: workspace.name,
      slug: workspace.slug,
    };
  }

  @Get(':id/members')
  @UseGuards(WorkspaceGuard)
  listMembers(@Param('id') id: string) {
    return this.workspacesService.listMembers(id);
  }

  /** Dziennik audytu workspace (zdarzenia dostępowe/administracyjne). */
  @Get(':id/audit')
  @UseGuards(WorkspaceGuard, RolesGuard)
  @Roles(Role.Owner)
  audit_(@Param('id') id: string) {
    return this.audit.list(id);
  }

  @Patch(':id/members/:userId')
  @UseGuards(WorkspaceGuard, RolesGuard)
  @Roles(Role.Owner)
  @HttpCode(204)
  async changeRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<void> {
    await this.workspacesService.changeMemberRole(id, userId, dto.role);
    await this.audit.log({
      workspaceId: id,
      actorId: user.userId,
      action: 'member.role_changed',
      target: userId,
      metadata: { role: dto.role },
    });
  }

  @Delete(':id/members/:userId')
  @UseGuards(WorkspaceGuard, RolesGuard)
  @Roles(Role.Owner)
  @HttpCode(204)
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.workspacesService.removeMember(id, userId);
    await this.audit.log({
      workspaceId: id,
      actorId: user.userId,
      action: 'member.removed',
      target: userId,
    });
  }
}
