import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AccessService } from './access.service';

class GroupNameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;
}
class GroupMembersDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  members: string[];
}
class AccessRuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  path: string;

  @IsIn(['all', 'group', 'user'])
  subjectType: 'all' | 'group' | 'user';

  @IsOptional()
  @IsString()
  subjectId?: string | null;

  @IsIn(['none', 'read', 'write'])
  level: 'none' | 'read' | 'write';
}

/** Zarządzanie grupami i regułami dostępu — tylko Owner workspace. */
@Controller('workspaces/:id')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@Roles(Role.Owner)
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get('groups')
  listGroups(@Param('id') ws: string) {
    return this.access.listGroups(ws);
  }

  @Post('groups')
  createGroup(@Param('id') ws: string, @Body() dto: GroupNameDto) {
    return this.access.createGroup(ws, dto.name);
  }

  @Patch('groups/:groupId')
  renameGroup(
    @Param('id') ws: string,
    @Param('groupId') groupId: string,
    @Body() dto: GroupNameDto,
  ) {
    return this.access.renameGroup(ws, groupId, dto.name);
  }

  @Delete('groups/:groupId')
  deleteGroup(@Param('id') ws: string, @Param('groupId') groupId: string) {
    return this.access.deleteGroup(ws, groupId);
  }

  @Put('groups/:groupId/members')
  setGroupMembers(
    @Param('id') ws: string,
    @Param('groupId') groupId: string,
    @Body() dto: GroupMembersDto,
  ) {
    return this.access.setGroupMembers(ws, groupId, dto.members);
  }

  @Get('access-rules')
  listRules(@Param('id') ws: string) {
    return this.access.listRules(ws);
  }

  @Put('access-rules')
  upsertRule(@Param('id') ws: string, @Body() dto: AccessRuleDto) {
    return this.access.upsertRule(ws, dto);
  }

  @Delete('access-rules/:ruleId')
  deleteRule(@Param('id') ws: string, @Param('ruleId') ruleId: string) {
    return this.access.deleteRule(ws, ruleId);
  }
}
