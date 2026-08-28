import { randomUUID } from 'crypto';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type DocumentSnippetDocument = HydratedDocument<DocumentSnippet>;

@Schema({ timestamps: true, collection: 'document_snippets' })
export class DocumentSnippet {
  @Prop({ type: String, required: true, unique: true, default: randomUUID })
  uuid: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  })
  workspaceId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 80 })
  name: string;

  @Prop({ default: '', maxlength: 240 })
  description: string;

  @Prop({ required: true, maxlength: 1_000_000 })
  contentRaw: string;
}

export const DocumentSnippetSchema =
  SchemaFactory.createForClass(DocumentSnippet);
DocumentSnippetSchema.index({ workspaceId: 1, name: 1 }, { unique: true });
DocumentSnippetSchema.index({ workspaceId: 1, createdAt: 1 });
