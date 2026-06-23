import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Role, ROLE_VALUES } from '../../common/enums/role.enum';

export type MembershipDocument = HydratedDocument<Membership>;

/**
 * Łącznik user ↔ workspace wraz z rolą.
 * Rola żyje tutaj (nie w userze) — user może należeć do wielu workspace'ów
 * z różnymi rolami.
 */
@Schema({ timestamps: true, collection: 'memberships' })
export class Membership {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  })
  workspaceId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: ROLE_VALUES, required: true })
  role: Role;
}

export const MembershipSchema = SchemaFactory.createForClass(Membership);

// Jeden user może mieć tylko jedno członkostwo w danym workspace.
MembershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
