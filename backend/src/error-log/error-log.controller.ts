import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { RequestWithWorkspace } from '../common/interfaces/request-with-workspace.interface';
import { ErrorLogService } from './error-log.service';
import { ClientErrorDto } from './dto/client-error.dto';

@Controller('workspaces/:id')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ErrorLogController {
  constructor(private readonly errors: ErrorLogService) {}

  /** Zgłoszenie błędu z granicy błędu frontu — każdy zalogowany członek. */
  @Post('client-errors')
  @HttpCode(204)
  async report(
    @Param('id') workspaceId: string,
    @Req() req: RequestWithWorkspace,
    @Body() dto: ClientErrorDto,
  ): Promise<void> {
    await this.errors.record({
      source: 'client',
      message: dto.message,
      stack: dto.stack ?? null,
      path: dto.url ?? null,
      requestId: (req as { requestId?: string }).requestId ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      workspaceId,
      userId: req.user?.userId ?? null,
    });
  }

  /** Podgląd błędów workspace — tylko Owner. Bez stack trace (sanityzowane). */
  @Get('errors')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner)
  list(
    @Param('id') workspaceId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.errors.list(workspaceId, {
      before,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
