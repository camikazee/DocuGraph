import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type WatchDocument = HydratedDocument<Watch>;

/** Obserwacja dokumentu przez użytkownika (server-side „watching"). */
@Schema({ timestamps: true, collection: 'watches' })
export class Watch {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  })
  workspaceId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  filePath: string;
}

export const WatchSchema = SchemaFactory.createForClass(Watch);
WatchSchema.index({ workspaceId: 1, userId: 1, filePath: 1 }, { unique: true });
WatchSchema.index({ workspaceId: 1, filePath: 1 });
