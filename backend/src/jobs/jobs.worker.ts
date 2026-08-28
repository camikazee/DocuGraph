import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { JobHandlersService } from './job-handlers.service';
import { JobsService } from './jobs.service';

@Injectable()
export class JobsWorker {
  private readonly logger = new Logger(JobsWorker.name);
  private readonly workerId = randomUUID();
  private running = false;

  constructor(
    private readonly jobs: JobsService,
    private readonly handlers: JobHandlersService,
  ) {}

  @Interval(1000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const job = await this.jobs.claimNext(this.workerId);
      if (!job) return;
      try {
        const handler = this.handlers.get(job.kind);
        if (!handler) throw new Error(`No handler registered for ${job.kind}`);
        await handler(job.payload);
        await this.jobs.complete(job.uuid);
      } catch (err) {
        await this.jobs.fail(job, err);
        this.logger.warn(
          `Job ${job.uuid} (${job.kind}) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } finally {
      this.running = false;
    }
  }
}
