import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export type RevisionDocument = HydratedDocument<Revision>;

/** Snapshot dokumentu zapisany przy każdej zmianie treści (historia edycji). */
@Schema({ timestamps: true, collection: 'document_revisions' })
export class Revision {
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

  @Prop({ required: true })
  filePath: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  contentRaw: string;

  /** Opcjonalny opis zmiany (jak commit message). */
  @Prop({ type: String, default: null })
  message: string | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  updatedBy: Types.ObjectId | null;
}

export const RevisionSchema = SchemaFactory.createForClass(Revision);

// Lista rewizji per dokument, najnowsze pierwsze.
RevisionSchema.index({ workspaceId: 1, filePath: 1, createdAt: -1 });
