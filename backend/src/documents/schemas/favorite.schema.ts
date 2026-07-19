import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type FavoriteDocument = HydratedDocument<Favorite>;

/** Zakładka użytkownika do dokumentu (ulubione — niezależne od „watching"). */
@Schema({ timestamps: true, collection: 'favorites' })
export class Favorite {
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

export const FavoriteSchema = SchemaFactory.createForClass(Favorite);
FavoriteSchema.index(
  { workspaceId: 1, userId: 1, filePath: 1 },
  { unique: true },
);
FavoriteSchema.index({ workspaceId: 1, userId: 1 });
