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
  CreateFrontmatterSchemaDto,
  UpdateFrontmatterSchemaDto,
} from './dto/frontmatter-schema.dto';
import { FrontmatterSchemasService } from './frontmatter-schemas.service';

@Controller('workspaces/:id/frontmatter-schemas')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class FrontmatterSchemasController {
  constructor(private readonly schemas: FrontmatterSchemasService) {}

  @Get()
  list(@Param('id') workspaceId: string) {
    return this.schemas.list(workspaceId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  create(
    @Param('id') workspaceId: string,
    @Body() dto: CreateFrontmatterSchemaDto,
  ) {
    return this.schemas.create(workspaceId, dto);
  }

  @Patch(':schemaId')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  update(
    @Param('id') workspaceId: string,
    @Param('schemaId') id: string,
    @Body() dto: UpdateFrontmatterSchemaDto,
  ) {
    return this.schemas.update(workspaceId, id, dto);
  }

  @Delete(':schemaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  async remove(
    @Param('id') workspaceId: string,
    @Param('schemaId') id: string,
  ): Promise<void> {
    await this.schemas.remove(workspaceId, id);
  }
}
