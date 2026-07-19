import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export type GroupDocument = HydratedDocument<Group>;

/** Nazwana grupa członków workspace (np. „dev", „client") do reguł dostępu. */
@Schema({ timestamps: true, collection: 'groups' })
export class Group {
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

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'User', default: [] })
  memberIds: Types.ObjectId[];
}

export const GroupSchema = SchemaFactory.createForClass(Group);
GroupSchema.index({ workspaceId: 1, name: 1 }, { unique: true });
