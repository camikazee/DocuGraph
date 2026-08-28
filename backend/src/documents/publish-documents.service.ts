import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { GitPublishService, PublishResult } from './git-publish.service';

export interface PublishActor {
  id: string | null;
  authType: 'jwt' | 'apiKey';
}

@Injectable()
export class PublishDocumentsService {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly users: UsersService,
    private readonly git: GitPublishService,
    private readonly audit: AuditService,
  ) {}

  async execute(
    workspaceId: string,
    actor: PublishActor,
    message: string,
  ): Promise<PublishResult> {
    const remote = await this.workspaces.getPushRemote(workspaceId);
    if (!remote) {
      throw new BadRequestException(
        'Configure a push remote first (Connect → publishing).',
      );
    }

    const source = (await this.workspaces.getSource(workspaceId)) as {
      branch?: string;
    } | null;
    const branch = source?.branch || 'main';
    let authorName = 'DocuGraph';
    let authorEmail = 'docugraph@localhost';
    if (actor.authType === 'jwt' && actor.id) {
      const user = await this.users.findById(actor.id);
      if (user) {
        authorName = user.name;
        authorEmail = user.email;
      }
    }

    const result = await this.git.publish({
      workspaceId,
      remote,
      branch,
      message: message || 'Publish from DocuGraph',
      authorName,
      authorEmail,
    });
    await this.audit.log({
      workspaceId,
      actorId: actor.id,
      action: 'documents.published',
      target: branch,
      metadata: { pushed: result.pushed, commit: result.commit ?? null },
    });
    return result;
  }
}
