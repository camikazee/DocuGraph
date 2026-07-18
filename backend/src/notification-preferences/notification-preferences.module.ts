import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import {
  NotificationPreference,
  NotificationPreferenceSchema,
} from './schemas/notification-preference.schema';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationPreferencesController } from './notification-preferences.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: NotificationPreference.name,
        schema: NotificationPreferenceSchema,
      },
    ]),
    AuthModule, // JwtAuthGuard
  ],
  controllers: [NotificationPreferencesController],
  providers: [NotificationPreferencesService],
  exports: [NotificationPreferencesService],
})
export class NotificationPreferencesModule {}
