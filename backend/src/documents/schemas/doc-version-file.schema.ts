import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type DocVersionFileDocument = HydratedDocument<DocVersionFile>;

/** Migawka pojedynczego dokumentu w danej wersji (treść zamrożona w czasie). */
@Schema({ timestamps: true, collection: 'doc_version_files' })
export class DocVersionFile {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'DocVersion',
    required: true,
  })
  versionId: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  })
  workspaceId: Types.ObjectId;

  @Prop({ required: true })
  filePath: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  contentHtml: string;

  @Prop({ default: '' })
  contentRaw: string;
}

export const DocVersionFileSchema =
  SchemaFactory.createForClass(DocVersionFile);
DocVersionFileSchema.index({ versionId: 1, filePath: 1 });
