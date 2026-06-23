import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export type ApiKeyDocument = HydratedDocument<ApiKey>;

/**
 * Token CI/CD (format `dg_live_<random>`).
 * W bazie trzymamy wyłącznie hash; surowiec pokazujemy raz przy utworzeniu.
 */
@Schema({ timestamps: true, collection: 'api_keys' })
export class ApiKey {
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

  /** SHA-256 surowego tokena. */
  @Prop({ required: true })
  keyHash: string;

  /** Prefiks + ostatnie znaki do wyświetlania, np. `dg_live_••••a1b2`. */
  @Prop({ required: true })
  keyPrefix: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Date, default: null })
  lastUsedAt: Date | null;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);

// Walidacja tokena CI/CD: lookup po hashu, scoped do workspace.
ApiKeySchema.index({ keyHash: 1 }, { unique: true });
ApiKeySchema.index({ workspaceId: 1 });
