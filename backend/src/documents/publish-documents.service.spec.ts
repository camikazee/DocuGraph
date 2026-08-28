import { BadRequestException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { GitPublishService } from './git-publish.service';
import { PublishDocumentsService } from './publish-documents.service';

describe('PublishDocumentsService', () => {
  const workspaces = {
    getPushRemote: jest.fn(),
    getSource: jest.fn(),
  };
  const users = { findById: jest.fn() };
  const git = { publish: jest.fn() };
  const audit = { log: jest.fn() };
  let service: PublishDocumentsService;

  beforeEach(() => {
    jest.resetAllMocks();
    workspaces.getPushRemote.mockResolvedValue('git@example/repo.git');
    workspaces.getSource.mockResolvedValue({ branch: 'docs' });
    git.publish.mockResolvedValue({
      pushed: true,
      files: 2,
      commit: 'abc123',
      message: 'Published',
    });
    service = new PublishDocumentsService(
      workspaces as unknown as WorkspacesService,
      users as unknown as UsersService,
      git as unknown as GitPublishService,
      audit as unknown as AuditService,
    );
  });

  it('rejects publishing without a configured remote', async () => {
    workspaces.getPushRemote.mockResolvedValue(null);
    await expect(
      service.execute('ws', { id: 'user', authType: 'jwt' }, ''),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(git.publish).not.toHaveBeenCalled();
  });

  it('uses the signed-in user as Git author and writes audit', async () => {
    users.findById.mockResolvedValue({ name: 'Ada', email: 'ada@example.com' });
    await service.execute(
      'ws',
      { id: 'user', authType: 'jwt' },
      'Release docs',
    );
    expect(git.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: 'docs',
        authorName: 'Ada',
        authorEmail: 'ada@example.com',
        message: 'Release docs',
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user',
        action: 'documents.published',
      }),
    );
  });

  it('uses a neutral author for API keys', async () => {
    await service.execute('ws', { id: null, authType: 'apiKey' }, '');
    expect(users.findById).not.toHaveBeenCalled();
    expect(git.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: 'docs',
        authorName: 'DocuGraph',
        authorEmail: 'docugraph@localhost',
        message: 'Publish from DocuGraph',
      }),
    );
  });

  it('does not audit a failed Git publication', async () => {
    git.publish.mockRejectedValue(new Error('push rejected'));
    await expect(
      service.execute('ws', { id: null, authType: 'apiKey' }, ''),
    ).rejects.toThrow('push rejected');
    expect(audit.log).not.toHaveBeenCalled();
  });
});
