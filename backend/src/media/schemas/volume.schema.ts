import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export type VolumeDocument = HydratedDocument<Volume>;

export const VOLUME_PROVIDERS = ['local', 's3', 'ftp'] as const;
export type VolumeProvider = (typeof VOLUME_PROVIDERS)[number];

export const VOLUME_STATUSES = ['connected', 'error'] as const;
export type VolumeStatus = (typeof VOLUME_STATUSES)[number];

/**
 * Wolumen (źródło storage) podpięty do workspace.
 * `config` zależy od providera; pola sekretne są szyfrowane (crypto.util).
 */
@Schema({ timestamps: true, collection: 'volumes' })
export class Volume {
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

  @Prop({ type: String, enum: VOLUME_PROVIDERS, required: true })
  provider: VolumeProvider;

  /** Konfiguracja providera (sekrety zaszyfrowane). */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  config: Record<string, string>;

  @Prop({ type: String, enum: VOLUME_STATUSES, default: 'connected' })
  status: VolumeStatus;

  @Prop({ type: Date, default: () => new Date() })
  lastConnectedAt: Date | null;

  /** Zsumowany rozmiar assetów (bajty) — odświeżany przy zmianach. */
  @Prop({ type: Number, default: 0 })
  storageUsed: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  createdBy: Types.ObjectId | null;
}

export const VolumeSchema = SchemaFactory.createForClass(Volume);
VolumeSchema.index({ workspaceId: 1, name: 1 });
