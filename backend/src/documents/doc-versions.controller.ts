import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CombinedAuthGuard } from '../common/guards/combined-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestWithWorkspace } from '../common/interfaces/request-with-workspace.interface';
import { AccessService, AccessChecker } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { DocVersionsService } from './doc-versions.service';

class PublishVersionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label: string;
}

@Controller('workspaces/:id/document-versions')
@UseGuards(CombinedAuthGuard)
export class DocVersionsController {
  constructor(
    private readonly versions: DocVersionsService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  private actorOf(req: RequestWithWorkspace): string | null {
    return req.authType === 'jwt' ? req.user.userId : null;
  }
  private checker(
    workspaceId: string,
    req: RequestWithWorkspace,
  ): Promise<AccessChecker> {
    return this.access.buildChecker(
      workspaceId,
      this.actorOf(req),
      req.workspaceRole,
    );
  }

  @Get()
  list(@Param('id') workspaceId: string) {
    return this.versions.list(workspaceId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  async publish(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Body() dto: PublishVersionDto,
  ) {
    const actor = this.actorOf(req);
    const result = await this.versions.publish(workspaceId, dto.label, actor);
    await this.audit.log({
      workspaceId,
      actorId: actor,
      action: 'version.published',
      target: `${result.label} (${result.docCount} docs)`,
    });
    return result;
  }

  @Delete(':versionId')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner)
  async remove(
    @Param('id') workspaceId: string,
    @Param('versionId') versionId: string,
    @Req() req: RequestWithWorkspace,
  ) {
    await this.versions.remove(workspaceId, versionId);
    await this.audit.log({
      workspaceId,
      actorId: this.actorOf(req),
      action: 'version.deleted',
      target: versionId,
    });
    return { deleted: true };
  }

  @Get(':versionId/documents')
  async listDocs(
    @Param('id') workspaceId: string,
    @Param('versionId') versionId: string,
    @Req() req: RequestWithWorkspace,
  ) {
    return this.versions.listDocs(
      workspaceId,
      versionId,
      await this.checker(workspaceId, req),
    );
  }

  @Get(':versionId/by-path')
  async getDoc(
    @Param('id') workspaceId: string,
    @Param('versionId') versionId: string,
    @Req() req: RequestWithWorkspace,
    @Query('path') path: string,
  ) {
    if (!path || typeof path !== 'string') {
      throw new BadRequestException('Query param "path" must be a string');
    }
    return this.versions.getDoc(
      workspaceId,
      versionId,
      path,
      await this.checker(workspaceId, req),
    );
  }
}
