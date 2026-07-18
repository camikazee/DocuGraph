import { Injectable, Logger } from '@nestjs/common';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { GitPublishService } from './git-publish.service';

/**
 * Automatyczny push edycji UI do repo (bidirectional sync). Wyzwalany po każdej
 * zmianie treści dokumentu — ale tylko gdy włączony przełącznik `bidirectional`
 * i skonfigurowany push remote.
 *
 * Wywołania są „fire-and-forget" (nie blokują odpowiedzi edycji). Operacje na
 * jednym workspace są **serializowane** (git na wspólnym working dirze nie może
 * biec współbieżnie) i **koalescują** — zmiany w trakcie publikacji wyzwalają
 * dokładnie jedno dodatkowe uruchomienie po zakończeniu.
 */
@Injectable()
export class AutoPublishService {
  private readonly logger = new Logger(AutoPublishService.name);
  private readonly running = new Set<string>();
  private readonly pending = new Set<string>();

  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly gitPublish: GitPublishService,
  ) {}

  /** Zgłasza chęć publikacji (nie blokuje). Bezpieczne do wielokrotnego wołania. */
  schedule(workspaceId: string): void {
    if (this.running.has(workspaceId)) {
      this.pending.add(workspaceId);
      return;
    }
    void this.run(workspaceId);
  }

  private async run(workspaceId: string): Promise<void> {
    this.running.add(workspaceId);
    try {
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'auto-sync failed';
      this.logger.warn(`Auto-sync failed for ${workspaceId}: ${msg}`);
    } finally {
      this.running.delete(workspaceId);
      // Zmiany zgłoszone w trakcie publikacji → dokładnie jedno dodatkowe biegnięcie.
      if (this.pending.delete(workspaceId)) void this.run(workspaceId);
    }
  }
}
