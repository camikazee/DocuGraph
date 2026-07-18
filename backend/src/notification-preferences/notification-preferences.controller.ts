import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
} from 'class-validator';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationPreferencesService } from './notification-preferences.service';

const MUTABLE_KINDS = ['changed', 'moved', 'comment'];

class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  digestEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(MUTABLE_KINDS, { each: true })
  mutedKinds?: string[];
}

@Controller('notification-preferences')
@UseGuards(JwtAuthGuard)
export class NotificationPreferencesController {
  constructor(private readonly prefs: NotificationPreferencesService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.prefs.get(user.userId);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.prefs.set(user.userId, {
      emailEnabled: dto.emailEnabled,
      digestEnabled: dto.digestEnabled,
      mutedKinds: dto.mutedKinds,
    });
  }
}
