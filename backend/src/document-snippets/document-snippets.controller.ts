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
  CreateDocumentSnippetDto,
  UpdateDocumentSnippetDto,
} from './dto/document-snippet.dto';
import { DocumentSnippetsService } from './document-snippets.service';

@Controller('workspaces/:id/document-snippets')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class DocumentSnippetsController {
  constructor(private readonly snippets: DocumentSnippetsService) {}

  @Get()
  list(@Param('id') workspaceId: string) {
    return this.snippets.list(workspaceId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  create(
    @Param('id') workspaceId: string,
    @Body() dto: CreateDocumentSnippetDto,
  ) {
    return this.snippets.create(workspaceId, dto);
  }

  @Patch(':snippetId')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  update(
    @Param('id') workspaceId: string,
    @Param('snippetId') id: string,
    @Body() dto: UpdateDocumentSnippetDto,
  ) {
    return this.snippets.update(workspaceId, id, dto);
  }

  @Delete(':snippetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  async remove(
    @Param('id') workspaceId: string,
    @Param('snippetId') id: string,
  ): Promise<void> {
    await this.snippets.remove(workspaceId, id);
  }
}
