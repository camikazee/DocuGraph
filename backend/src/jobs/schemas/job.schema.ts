import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type JobDocument = HydratedDocument<Job>;

@Schema({ timestamps: true, collection: 'jobs' })
export class Job {
  @Prop({ required: true, unique: true, default: () => randomUUID() })
  uuid: string;

  @Prop({ required: true })
  kind: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  payload: Record<string, unknown>;

  @Prop({ required: true, unique: true })
  idempotencyKey: string;

  @Prop({ required: true, enum: ['pending', 'running', 'completed', 'failed'] })
  status: JobStatus;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: 5 })
  maxAttempts: number;

  @Prop({ type: Date, default: () => new Date() })
  runAt: Date;

  @Prop({ type: Date, default: null })
  leasedUntil: Date | null;

  @Prop({ type: String, default: null })
  workerId: string | null;

  @Prop({ type: String, default: null })
  lastError: string | null;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;
}

export const JobSchema = SchemaFactory.createForClass(Job);
JobSchema.index({ status: 1, runAt: 1, leasedUntil: 1 });
JobSchema.index({ completedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
