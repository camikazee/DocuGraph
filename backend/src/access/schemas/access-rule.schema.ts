import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export type AccessRuleDocument = HydratedDocument<AccessRule>;

export type AccessLevel = 'none' | 'read' | 'write';
export type SubjectType = 'all' | 'group' | 'user';

/**
 * Reguła dostępu do ścieżki. `path` to folder (z „/" na końcu) albo dokładny
 * plik. `subjectType`: all (wszyscy w workspace) / group / user. Poziom:
 * none (ukryty) / read / write. Bardziej szczegółowa ścieżka wygrywa.
 */
@Schema({ timestamps: true, collection: 'access_rules' })
export class AccessRule {
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

  /** Folder (prefiks kończący się „/") lub dokładny plik `.md`. */
  @Prop({ required: true })
  path: string;

  @Prop({ type: String, enum: ['all', 'group', 'user'], required: true })
  subjectType: SubjectType;

  /** Group._id lub User._id; null dla subjectType 'all'. */
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  subjectId: Types.ObjectId | null;

  @Prop({ type: String, enum: ['none', 'read', 'write'], required: true })
  level: AccessLevel;
}

export const AccessRuleSchema = SchemaFactory.createForClass(AccessRule);
AccessRuleSchema.index({ workspaceId: 1 });
