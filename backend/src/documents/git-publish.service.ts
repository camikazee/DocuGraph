import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { promises as fs } from 'fs';
import * as path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';
import {
  DocumentEntity,
  DocumentEntityDocument,
} from './schemas/document.schema';

export interface PublishResult {
  pushed: boolean;
  files: number;
  commit?: string;
  message: string;
}

export interface PublishOptions {
  workspaceId: string;
  /** Odszyfrowany URL/ścieżka zdalnego repo (może zawierać token). */
  remote: string;
  branch: string;
  message: string;
  authorName: string;
  authorEmail: string;
}

/**
 * „Publish to Git" — commituje aktualne dokumenty workspace'u (SSoT z Mongo)
 * do roboczego klona i pushuje na skonfigurowany remote. Działa z dowolnym
 * zdalnym repo gita; GitHub różni się tylko uwierzytelnionym URL-em + tokenem.
 */
@Injectable()
export class GitPublishService {
  private readonly logger = new Logger(GitPublishService.name);
  private readonly root: string;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(DocumentEntity.name)
    private readonly docModel: Model<DocumentEntityDocument>,
  ) {
    this.root = path.resolve(
      config.get<string>('workspaceRoot') ?? './workspaces',
    );
  }

  private workDir(workspaceId: string): string {
    return path.join(this.root, '.git-publish', workspaceId);
  }

  async publish(opts: PublishOptions): Promise<PublishResult> {
    const { workspaceId, remote, branch, message } = opts;
    const dir = this.workDir(workspaceId);
    await fs.mkdir(dir, { recursive: true });
    const git: SimpleGit = simpleGit(dir);

    const isRepo = await git.checkIsRepo().catch(() => false);
    if (!isRepo) await git.init();

    await git.addConfig('user.name', opts.authorName || 'DocuGraph');
    await git.addConfig('user.email', opts.authorEmail || 'docugraph@localhost');

    const remotes = await git.getRemotes(true);
    if (remotes.some((r) => r.name === 'origin')) {
      await git.remote(['set-url', 'origin', remote]);
    } else {
      await git.addRemote('origin', remote);
    }

    // Wyrównaj do czubka zdalnej gałęzi (jeśli istnieje), aby commit był jej
    // potomkiem i push był fast-forward. Pusty/nowy remote → świeża gałąź.
    try {
      await git.fetch('origin', branch);
      await git.checkout(['-B', branch, `origin/${branch}`]);
    } catch {
      await git.checkout(['-B', branch]).catch(() => undefined);
    }

    // Zsynchronizuj drzewo z SSoT: usuń śledzone pliki (poza .git), zapisz docs.
    await this.clearTree(dir);
    const docs = await this.docModel
      .find({ workspaceId })
      .select('filePath contentRaw')
      .lean()
      .exec();
    for (const d of docs) {
      const rel = this.safeRel(d.filePath);
      if (!rel) continue;
      const full = path.join(dir, rel);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, d.contentRaw, 'utf8');
    }

    await git.add('-A');
    const status = await git.status();
    if (status.files.length === 0) {
      return {
        pushed: false,
        files: docs.length,
        message: 'Nothing to publish — the repository is already up to date.',
      };
    }

    const commit = await git.commit(message || 'Publish from DocuGraph');
    try {
      await git.push(['origin', `HEAD:${branch}`]);
    } catch (err) {
      const m = err instanceof Error ? err.message : 'push failed';
      throw new BadRequestException(`Commit created but push failed: ${m}`);
    }

    this.logger.log(
      `Published ${docs.length} doc(s) for ${workspaceId} → ${branch} (${commit.commit})`,
    );
    return {
      pushed: true,
      files: docs.length,
      commit: commit.commit,
      message: `Published ${docs.length} document(s) to ${branch}.`,
    };
  }

  private async clearTree(dir: string): Promise<void> {
    const entries = await fs.readdir(dir);
    await Promise.all(
      entries
        .filter((e) => e !== '.git')
        .map((e) => fs.rm(path.join(dir, e), { recursive: true, force: true })),
    );
  }

  /** Względna, bezpieczna ścieżka .md (ochrona przed traversal). */
  private safeRel(filePath: string): string | null {
    const norm = path.normalize(filePath).replace(/^(\.\/)+/, '');
    if (path.isAbsolute(norm) || norm.split(path.sep).includes('..')) {
      return null;
    }
    if (!norm.toLowerCase().endsWith('.md')) return null;
    return norm;
  }
}
