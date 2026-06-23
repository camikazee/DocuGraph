import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type EventDocument = HydratedDocument<Event>;

/** Zdarzenie telemetryczne (na razie: odczyt dokumentu z czasem dwell). */
@Schema({ timestamps: true, collection: 'events' })
export class Event {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  })
  workspaceId: Types.ObjectId;

  @Prop({ required: true })
  filePath: string;

  @Prop({ default: 'read' })
  kind: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  userId: Types.ObjectId | null;

  /** Czas spędzony na dokumencie (ms) — do średniego czasu czytania. */
  @Prop({ default: 0 })
  durationMs: number;
}

export const EventSchema = SchemaFactory.createForClass(Event);
EventSchema.index({ workspaceId: 1, kind: 1, createdAt: -1 });
EventSchema.index({ workspaceId: 1, filePath: 1 });
