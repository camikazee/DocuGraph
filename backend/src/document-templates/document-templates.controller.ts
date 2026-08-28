import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import {
  CreateDocumentTemplateDto,
  UpdateDocumentTemplateDto,
} from './dto/document-template.dto';
import { DocumentTemplatesService } from './document-templates.service';

@Controller('workspaces/:id/document-templates')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class DocumentTemplatesController {
  constructor(private readonly templates: DocumentTemplatesService) {}

  @Get()
  list(@Param('id') workspaceId: string) {
    return this.templates.list(workspaceId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  create(
    @Param('id') workspaceId: string,
    @Body() dto: CreateDocumentTemplateDto,
  ) {
    return this.templates.create(workspaceId, dto);
  }

  @Patch(':templateId')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  update(
    @Param('id') workspaceId: string,
    @Param('templateId') id: string,
    @Body() dto: UpdateDocumentTemplateDto,
  ) {
    return this.templates.update(workspaceId, id, dto);
  }

  @Delete(':templateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  async remove(
    @Param('id') workspaceId: string,
    @Param('templateId') id: string,
  ): Promise<void> {
    await this.templates.remove(workspaceId, id);
  }
}
