import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export type AuditLogDocument = HydratedDocument<AuditLog>;

/**
 * Wpis dziennika audytu — zdarzenie dostępowe/administracyjne w workspace.
 * `actorId` = kto wykonał akcję (null = system/CI). `action` to stabilny slug
 * (np. `member.role_changed`), `target` to czytelny opis obiektu akcji.
 */
@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog {
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

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  actorId: Types.ObjectId | null;

  @Prop({ required: true })
  action: string;

  @Prop({ type: String, default: null })
  target: string | null;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  metadata: Record<string, unknown> | null;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Lista per workspace, najnowsze pierwsze.
AuditLogSchema.index({ workspaceId: 1, createdAt: -1 });
