import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DocumentSnippetsController } from './document-snippets.controller';
import { DocumentSnippetsService } from './document-snippets.service';
import {
  DocumentSnippet,
  DocumentSnippetSchema,
} from './schemas/document-snippet.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentSnippet.name, schema: DocumentSnippetSchema },
    ]),
    AuthModule,
    WorkspacesModule,
  ],
  controllers: [DocumentSnippetsController],
  providers: [DocumentSnippetsService],
})
export class DocumentSnippetsModule {}
