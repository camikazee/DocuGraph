import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export type AssetDocument = HydratedDocument<Asset>;

export const ASSET_TYPES = ['image', 'pdf', 'doc', 'other'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/** Wpis indeksu mediów — metadane assetu (bajty trzyma provider wolumenu). */
@Schema({ timestamps: true, collection: 'assets' })
export class Asset {
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

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Volume',
    required: true,
  })
  volumeId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  /** Ścieżka wewnątrz wolumenu (klucz dla providera). */
  @Prop({ required: true })
  path: string;

  @Prop({ default: '' })
  folder: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ type: String, enum: ASSET_TYPES, default: 'other' })
  type: AssetType;

  @Prop({ default: 0 })
  size: number;

  @Prop({ type: Number, default: null })
  width: number | null;

  @Prop({ type: Number, default: null })
  height: number | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  uploadedBy: Types.ObjectId | null;
}

export const AssetSchema = SchemaFactory.createForClass(Asset);
AssetSchema.index({ workspaceId: 1, createdAt: -1 });
