import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DocumentsService } from './documents.service';

/** Codzienny wyzwalacz digestu (logika w DocumentsService.sendDailyDigests). */
@Injectable()
export class DigestCron {
  private readonly logger = new Logger('DigestCron');

  constructor(private readonly documents: DocumentsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async run(): Promise<void> {
    try {
      const sent = await this.documents.sendDailyDigests();
      if (sent > 0) this.logger.log(`Sent ${sent} digest email(s)`);
    } catch (err) {
      this.logger.error(
        'Daily digest run failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
