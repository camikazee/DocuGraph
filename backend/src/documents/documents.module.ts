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
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { WebhooksController } from './webhooks.controller';
import { WorkspaceStorageService } from './workspace-storage.service';
import { MarkdownParserService } from './markdown-parser.service';
import { GitPublishService } from './git-publish.service';
import { AutoPublishService } from './auto-publish.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentEntity.name, schema: DocumentSchema },
      { name: Revision.name, schema: RevisionSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Event.name, schema: EventSchema },
      { name: Watch.name, schema: WatchSchema },
    ]),
    AuthModule, // JwtService (dla CombinedAuthGuard)
    WorkspacesModule, // WorkspacesService
    ApiKeysModule, // ApiKeysService
    UsersModule, // UsersService (autor commita w „Publish to Git")
  ],
  controllers: [DocumentsController, WebhooksController],
  providers: [
    DocumentsService,
    WorkspaceStorageService,
    MarkdownParserService,
    GitPublishService,
    AutoPublishService,
  ],
})
export class DocumentsModule {}
