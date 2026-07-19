import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { randomUUID } from 'crypto';

export type ReviewState = 'approved' | 'changes_requested';
export const REVIEW_STATES: ReviewState[] = ['approved', 'changes_requested'];

export type ReviewStatusDocument = HydratedDocument<ReviewStatus>;

/**
 * Stan recenzji dokumentu (jeden rekord na plik). Brak rekordu = „in review".
 * Trzymany osobno od indeksu dokumentu, by przetrwał re-index z dysku.
 */
@Schema({ timestamps: true, collection: 'review_statuses' })
export class ReviewStatus {
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

  @Prop({ required: true, enum: REVIEW_STATES })
  status: ReviewState;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  reviewedBy: Types.ObjectId | null;
}

export const ReviewStatusSchema = SchemaFactory.createForClass(ReviewStatus);
ReviewStatusSchema.index({ workspaceId: 1, filePath: 1 }, { unique: true });
