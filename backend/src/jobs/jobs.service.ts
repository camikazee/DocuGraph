import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job, JobDocument } from './schemas/job.schema';

@Injectable()
export class JobsService {
  constructor(
    @InjectModel(Job.name) private readonly jobModel: Model<JobDocument>,
  ) {}

  async enqueue(
    kind: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    maxAttempts = 5,
  ): Promise<void> {
    await this.jobModel
      .updateOne(
        { idempotencyKey },
        {
          $setOnInsert: {
            kind,
            payload,
            idempotencyKey,
            status: 'pending',
            attempts: 0,
            maxAttempts,
            runAt: new Date(),
          },
        },
        { upsert: true },
      )
      .exec();
  }

  claimNext(workerId: string): Promise<JobDocument | null> {
    const now = new Date();
    const leasedUntil = new Date(now.getTime() + 30_000);
    return this.jobModel
      .findOneAndUpdate(
        {
          $or: [
            { status: 'pending', runAt: { $lte: now } },
            { status: 'running', leasedUntil: { $lte: now } },
          ],
          $expr: { $lt: ['$attempts', '$maxAttempts'] },
        },
        {
          $set: { status: 'running', workerId, leasedUntil },
          $inc: { attempts: 1 },
        },
        { sort: { runAt: 1, createdAt: 1 }, new: true },
      )
      .exec();
  }

  async complete(uuid: string): Promise<void> {
    await this.jobModel
      .updateOne(
        { uuid, status: 'running' },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            leasedUntil: null,
            workerId: null,
            lastError: null,
          },
        },
      )
      .exec();
  }

  async fail(job: JobDocument, error: unknown): Promise<void> {
    const terminal = job.attempts >= job.maxAttempts;
    const message = (error instanceof Error ? error.message : String(error))
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 500);
    const delaySeconds = Math.min(60, 2 ** Math.max(0, job.attempts));
    await this.jobModel
      .updateOne(
        { uuid: job.uuid, status: 'running' },
        {
          $set: {
            status: terminal ? 'failed' : 'pending',
            runAt: terminal
              ? job.runAt
              : new Date(Date.now() + delaySeconds * 1000),
            leasedUntil: null,
            workerId: null,
            lastError: message,
            completedAt: terminal ? new Date() : null,
          },
        },
      )
      .exec();
  }
}
