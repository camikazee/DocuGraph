import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JobHandlersService } from '../jobs/job-handlers.service';
import { JobsService } from '../jobs/jobs.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { GitPublishService } from './git-publish.service';

const JOB_KIND = 'git-auto-publish';

/** Durable automatic Git publication for bidirectional workspaces. */
@Injectable()
export class AutoPublishService implements OnModuleInit {
  private readonly logger = new Logger(AutoPublishService.name);

  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly gitPublish: GitPublishService,
    private readonly jobs: JobsService,
    private readonly handlers: JobHandlersService,
  ) {}

  onModuleInit(): void {
    this.handlers.register(JOB_KIND, async (payload) => {
      const workspaceId = payload.workspaceId;
      if (typeof workspaceId !== 'string') {
        throw new Error('Invalid git-auto-publish payload');
      }
      await this.publish(workspaceId);
    });
  }

  /** Queue publication without making a persisted document mutation fail. */
  schedule(workspaceId: string): void {
    void this.queueIfEnabled(workspaceId).catch((err: unknown) => {
      this.logger.error(
        `Could not queue auto-sync for ${workspaceId}`,
        err instanceof Error ? err.stack : String(err),
      );
    });
  }

  private async queueIfEnabled(workspaceId: string): Promise<void> {
    const source = (await this.workspaces.getSource(workspaceId)) as {
      bidirectional?: boolean;
    } | null;
    if (!source?.bidirectional) return;
    await this.jobs.enqueue(
      JOB_KIND,
      { workspaceId },
      `${JOB_KIND}:${workspaceId}:${randomUUID()}`,
    );
  }

  private async publish(workspaceId: string): Promise<void> {
    const source = (await this.workspaces.getSource(workspaceId)) as {
      bidirectional?: boolean;
      branch?: string;
    } | null;
    if (!source?.bidirectional) return;

    const remote = await this.workspaces.getPushRemote(workspaceId);
    if (!remote) return;
    const result = await this.gitPublish.publish({
      workspaceId,
      remote,
      branch: source.branch || 'main',
      message: 'Auto-sync from DocuGraph',
      authorName: 'DocuGraph',
      authorEmail: 'docugraph@localhost',
    });
    if (result.pushed) {
      this.logger.log(`Auto-synced ${workspaceId} (${result.commit})`);
    }
  }
}
