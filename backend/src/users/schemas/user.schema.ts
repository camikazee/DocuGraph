import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'crypto';

export type UserDocument = HydratedDocument<User>;

/**
 * Powiązanie konta z zewnętrznym dostawcą OAuth (np. GitHub).
 * Jeden user może mieć wielu providerów oraz/lub hasło.
 */
@Schema({ _id: false })
export class AuthProvider {
  @Prop({ required: true, enum: ['github', 'slack'] })
  provider: string;

  @Prop({ required: true })
  providerUserId: string;

  @Prop({ required: true })
  username: string;
}

const AuthProviderSchema = SchemaFactory.createForClass(AuthProvider);

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  uuid: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  name: string;

  /**
   * Hash hasła (bcrypt). `null` dla kont wyłącznie OAuth.
   * `select: false` — nigdy nie wraca w domyślnych zapytaniach.
   */
  @Prop({ type: String, default: null, select: false })
  passwordHash: string | null;

  @Prop({ type: [AuthProviderSchema], default: [] })
  authProviders: AuthProvider[];

  @Prop({ type: String, default: null })
  avatarUrl: string | null;

  /** Uchwyt (np. @jankowalski) — opcjonalny, edytowalny w profilu. */
  @Prop({ type: String, default: null, trim: true })
  username: string | null;

  /** Krótkie bio widoczne w profilu. */
  @Prop({ type: String, default: null })
  bio: string | null;

  /**
   * Reset hasła: hash (SHA-256) jednorazowego tokenu + jego wygaśnięcie.
   * `select: false` — nigdy nie wracają w domyślnych zapytaniach.
   */
  @Prop({ type: String, default: null, select: false })
  passwordResetTokenHash: string | null;

  @Prop({ type: Date, default: null, select: false })
  passwordResetExpires: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
