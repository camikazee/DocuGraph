import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export type ShareLinkDocument = HydratedDocument<ShareLink>;

/**
 * Publiczny link tylko-do-odczytu do pojedynczego dokumentu. Token trzymamy
 * wyłącznie jako hash (jak inne sekrety). Link jest odwoływalny i może wygasać;
 * dostęp przez niego jest jawnym nadaniem — omija ACL dla tego jednego pliku.
 */
@Schema({ timestamps: true, collection: 'share_links' })
export class ShareLink {
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

  @Prop({ required: true })
  filePath: string;

  /** SHA-256 surowego tokena (surowiec pokazujemy tylko raz przy tworzeniu). */
  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  createdBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;
}

export const ShareLinkSchema = SchemaFactory.createForClass(ShareLink);
ShareLinkSchema.index({ workspaceId: 1, filePath: 1 });
