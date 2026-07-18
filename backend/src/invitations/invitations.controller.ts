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
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { InvitationsService } from './invitations.service';
import { AuditService } from '../audit/audit.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(
    private readonly invitationsService: InvitationsService,
    private readonly audit: AuditService,
  ) {}

  @Post('workspaces/:id/invitations')
  @UseGuards(WorkspaceGuard, RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  async create(
    @Param('id') workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvitationDto,
  ) {
    const invitation = await this.invitationsService.create(
      workspaceId,
      user.userId,
      dto.email,
      dto.role,
    );
    await this.audit.log({
      workspaceId,
      actorId: user.userId,
      action: 'invitation.created',
      target: dto.email,
      metadata: { role: dto.role },
    });
    return invitation;
  }

  @Get('workspaces/:id/invitations')
  @UseGuards(WorkspaceGuard, RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  listPending(@Param('id') workspaceId: string) {
    return this.invitationsService.listPending(workspaceId);
  }

  @Delete('workspaces/:id/invitations/:invitationId')
  @UseGuards(WorkspaceGuard, RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  @HttpCode(204)
  async revoke(
    @Param('id') workspaceId: string,
    @Param('invitationId') invitationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.invitationsService.revoke(workspaceId, invitationId);
    await this.audit.log({
      workspaceId,
      actorId: user.userId,
      action: 'invitation.revoked',
      target: invitationId,
    });
  }

  /** Akceptacja — kontekst workspace wynika z samego zaproszenia. */
  @Post('invitations/accept')
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.invitationsService.accept(dto.token, user.userId);
  }
}
