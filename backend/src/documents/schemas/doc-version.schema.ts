import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export type DocVersionDocument = HydratedDocument<DocVersion>;

/** Nagłówek opublikowanej wersji (migawki) zestawu dokumentów. */
@Schema({ timestamps: true, collection: 'doc_versions' })
export class DocVersion {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  uuid: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  })
  workspaceId: Types.ObjectId;

  /** Etykieta wersji, np. „v2.1". Unikalna w obrębie workspace. */
  @Prop({ required: true })
  label: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  createdBy: Types.ObjectId | null;

  @Prop({ default: 0 })
  docCount: number;
}

export const DocVersionSchema = SchemaFactory.createForClass(DocVersion);
DocVersionSchema.index({ workspaceId: 1, label: 1 }, { unique: true });
