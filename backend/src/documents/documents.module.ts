import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { UsersModule } from '../users/users.module';
import { DocumentEntity, DocumentSchema } from './schemas/document.schema';
import { Revision, RevisionSchema } from './schemas/revision.schema';
import { Comment, CommentSchema } from './schemas/comment.schema';
import { Event, EventSchema } from './schemas/event.schema';
import { Watch, WatchSchema } from './schemas/watch.schema';
import { Favorite, FavoriteSchema } from './schemas/favorite.schema';
import {
  ReviewStatus,
  ReviewStatusSchema,
} from './schemas/review-status.schema';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { WebhooksController } from './webhooks.controller';
import { WorkspaceStorageService } from './workspace-storage.service';
import { MarkdownParserService } from './markdown-parser.service';
import { GitPublishService } from './git-publish.service';
import { AutoPublishService } from './auto-publish.service';
import { DigestCron } from './digest.cron';
import { AuditModule } from '../audit/audit.module';
import { MailerModule } from '../common/mailer/mailer.module';
import { NotificationPreferencesModule } from '../notification-preferences/notification-preferences.module';
import { MediaModule } from '../media/media.module';
import { AccessModule } from '../access/access.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentEntity.name, schema: DocumentSchema },
      { name: Revision.name, schema: RevisionSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Event.name, schema: EventSchema },
      { name: Watch.name, schema: WatchSchema },
      { name: Favorite.name, schema: FavoriteSchema },
      { name: ReviewStatus.name, schema: ReviewStatusSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
    AuthModule, // JwtService (dla CombinedAuthGuard)
    WorkspacesModule, // WorkspacesService
    ApiKeysModule, // ApiKeysService
    UsersModule, // UsersService (autor commita w „Publish to Git")
    AuditModule, // AuditService (dziennik zdarzeń doc-level)
    MailerModule, // e-mail o zmianach obserwowanych dokumentów
    NotificationPreferencesModule, // opt-in na e-maile
    MediaModule, // odczyt bajtów assetów (osadzanie obrazów w eksporcie)
    AccessModule, // grupy + reguły dostępu (egzekwowanie per-resource)
  ],
  controllers: [DocumentsController, WebhooksController],
  providers: [
    DocumentsService,
    WorkspaceStorageService,
    MarkdownParserService,
    GitPublishService,
    AutoPublishService,
    DigestCron,
  ],
})
export class DocumentsModule {}
