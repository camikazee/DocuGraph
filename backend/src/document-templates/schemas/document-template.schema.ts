import { randomUUID } from 'crypto';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type DocumentTemplateDocument = HydratedDocument<DocumentTemplate>;

@Schema({ timestamps: true, collection: 'document_templates' })
export class DocumentTemplate {
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

  @Prop({ required: true, trim: true, maxlength: 1024 })
  suggestedPath: string;

  @Prop({ required: true, maxlength: 1_000_000 })
  contentRaw: string;
}

export const DocumentTemplateSchema =
  SchemaFactory.createForClass(DocumentTemplate);

DocumentTemplateSchema.index({ workspaceId: 1, name: 1 }, { unique: true });
DocumentTemplateSchema.index({ workspaceId: 1, createdAt: 1 });
