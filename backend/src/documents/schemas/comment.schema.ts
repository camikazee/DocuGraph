import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export type CommentDocument = HydratedDocument<Comment>;

/** Komentarz recenzji zakotwiczony w bloku dokumentu (wątek = wspólny `line`). */
@Schema({ timestamps: true, collection: 'comments' })
export class Comment {
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

  /** Indeks bloku/akapitu w dokumencie — kotwica wątku. */
  @Prop({ required: true })
  line: number;

  @Prop({ default: '' })
  quote: string;

  @Prop({ required: true })
  body: string;

  @Prop({ default: false })
  resolved: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  author: Types.ObjectId | null;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
CommentSchema.index({ workspaceId: 1, filePath: 1, createdAt: 1 });
