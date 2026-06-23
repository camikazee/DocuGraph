import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { Role, ROLE_VALUES } from '../../common/enums/role.enum';

export type InvitationDocument = HydratedDocument<Invitation>;

export enum InvitationStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Revoked = 'revoked',
  Expired = 'expired',
}

const INVITATION_STATUS_VALUES = Object.values(InvitationStatus);

@Schema({ timestamps: true, collection: 'invitations' })
export class Invitation {
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

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ type: String, enum: ROLE_VALUES, required: true })
  role: Role;

  /** SHA-256 surowego tokena zaproszenia. Surowiec trafia tylko do linku. */
  @Prop({ required: true })
  tokenHash: string;

  @Prop({
    type: String,
    enum: INVITATION_STATUS_VALUES,
    default: InvitationStatus.Pending,
  })
  status: InvitationStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  invitedBy: Types.ObjectId;

  @Prop({ required: true })
  expiresAt: Date;
}

export const InvitationSchema = SchemaFactory.createForClass(Invitation);

// Szybkie wyszukiwanie zaproszeń per workspace oraz po hashu tokena (akceptacja).
InvitationSchema.index({ workspaceId: 1, status: 1 });
InvitationSchema.index({ tokenHash: 1 });
