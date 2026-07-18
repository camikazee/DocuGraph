import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type NotificationPreferenceDocument =
  HydratedDocument<NotificationPreference>;

/** Preferencje powiadomień użytkownika (na razie: e-mail o obserwowanych zmianach). */
@Schema({ timestamps: true, collection: 'notification_preferences' })
export class NotificationPreference {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  })
  userId: Types.ObjectId;

  /** Czy wysyłać e-mail przy zmianie obserwowanego dokumentu (domyślnie nie). */
  @Prop({ type: Boolean, default: false })
  emailEnabled: boolean;
}

export const NotificationPreferenceSchema = SchemaFactory.createForClass(
  NotificationPreference,
);
