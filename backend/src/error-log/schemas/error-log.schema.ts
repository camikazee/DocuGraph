import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export type ErrorSource = 'server' | 'client';
export type ErrorLogDocument = HydratedDocument<ErrorLog>;

/**
 * Lokalny dziennik błędów (zamiast zewnętrznego Sentry). Rekord na błąd:
 * nieobsłużony 5xx z backendu albo błąd zgłoszony z granicy błędu frontu.
 * Auto-wygasa (TTL), żeby nie rósł w nieskończoność.
 */
@Schema({ timestamps: true, collection: 'error_logs' })
export class ErrorLog {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  uuid: string;

  @Prop({ required: true, enum: ['server', 'client'] })
  source: ErrorSource;

  @Prop({ required: true })
  message: string;

  /** Pełny stos — trzymany lokalnie dla operatora, nie zwracany przez API. */
  @Prop({ type: String, default: null })
  stack: string | null;

  @Prop({ type: String, default: null })
  method: string | null;

  @Prop({ type: String, default: null })
  path: string | null;

  @Prop({ type: Number, default: null })
  statusCode: number | null;

  @Prop({ type: String, default: null })
  requestId: string | null;

  @Prop({ type: String, default: null })
  userAgent: string | null;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Workspace',
    default: null,
  })
  workspaceId: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  userId: Types.ObjectId | null;
}

export const ErrorLogSchema = SchemaFactory.createForClass(ErrorLog);
ErrorLogSchema.index({ workspaceId: 1, createdAt: -1 });
// Auto-prune po 30 dniach (dziennik operacyjny, nie archiwum).
ErrorLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 },
);
