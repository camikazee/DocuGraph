import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export type WorkspaceDocument = HydratedDocument<Workspace>;

/** Konfiguracja źródła dokumentacji (repo Git) — Moduł F. */
@Schema({ _id: false })
export class WorkspaceSource {
  @Prop({ type: String, default: null })
  provider: string | null; // 'github'

  @Prop({ type: String, default: null })
  repo: string | null; // 'owner/name'

  @Prop({ default: 'main' })
  branch: string;

  @Prop({ default: '' })
  root: string;

  @Prop({ default: false })
  realtimeWebhooks: boolean;

  @Prop({ default: false })
  bidirectional: boolean;

  @Prop({ default: false })
  enforceTemplates: boolean;

  /** Sekret HMAC do weryfikacji webhooków (generowany przy włączeniu). */
  @Prop({ type: String, default: null })
  webhookSecret: string | null;

  /**
   * Zdalne repo do publikacji (commit & push). Zaszyfrowane (AES-256-GCM) —
   * URL może zawierać token. Nigdy nie wraca w getSource (tylko `pushConfigured`).
   */
  @Prop({ type: String, default: null })
  pushRemote: string | null;

  @Prop({ type: Date, default: null })
  lastIndexedAt: Date | null;
}
const WorkspaceSourceSchema = SchemaFactory.createForClass(WorkspaceSource);

@Schema({ timestamps: true, collection: 'workspaces' })
export class Workspace {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  uuid: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  @Prop({ type: WorkspaceSourceSchema, default: () => ({}) })
  source: WorkspaceSource;
}

export const WorkspaceSchema = SchemaFactory.createForClass(Workspace);
