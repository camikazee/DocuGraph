import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export type NotificationDocument = HydratedDocument<Notification>;

/**
 * Powiadomienie dla obserwującego usera, gdy zmieni się obserwowany dokument.
 * `actorId` = kto wywołał zmianę (null = CI/automat).
 */
@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
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

  /** Odbiorca powiadomienia. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  filePath: string;

  @Prop({ required: true })
  title: string;

  /** Rodzaj zdarzenia (na razie tylko zmiana treści). */
  @Prop({ type: String, default: 'changed' })
  kind: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  actorId: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  readAt: Date | null;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Lista per odbiorca, najnowsze pierwsze; szybkie liczenie nieprzeczytanych.
NotificationSchema.index({ workspaceId: 1, userId: 1, createdAt: -1 });
NotificationSchema.index({ workspaceId: 1, userId: 1, readAt: 1 });
