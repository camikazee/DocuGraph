import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { DocumentTemplatesService } from './document-templates.service';
import { DocumentTemplate } from './schemas/document-template.schema';

function query<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('DocumentTemplatesService', () => {
  const model = {
    find: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
  };
  let service: DocumentTemplatesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DocumentTemplatesService,
        { provide: getModelToken(DocumentTemplate.name), useValue: model },
      ],
    }).compile();
    service = module.get(DocumentTemplatesService);
  });

  it('lists built-ins before workspace templates without leaking _id', async () => {
    model.find.mockReturnValue(
      query([
        {
          _id: 'internal',
          uuid: 'custom-id',
          name: 'Runbook',
          description: '',
          suggestedPath: 'ops/runbook.md',
          contentRaw: '# Runbook',
        },
      ]),
    );

    const result = await service.list('workspace-a');

    expect(result[0]).toEqual(
      expect.objectContaining({ id: 'builtin:guide', builtIn: true }),
    );
    expect(result.at(-1)).toEqual({
      id: 'custom-id',
      name: 'Runbook',
      description: '',
      suggestedPath: 'ops/runbook.md',
      contentRaw: '# Runbook',
      builtIn: false,
    });
    expect(result.at(-1)).not.toHaveProperty('_id');
    expect(model.find).toHaveBeenCalledWith({ workspaceId: 'workspace-a' });
  });

  it('creates a trimmed custom template', async () => {
    model.create.mockResolvedValue({
      uuid: 'new-id',
      name: 'Runbook',
      description: 'Operations',
      suggestedPath: 'ops/runbook.md',
      contentRaw: '# Runbook',
    });

    await expect(
      service.create('workspace-a', {
        name: '  Runbook  ',
        description: '  Operations  ',
        suggestedPath: '  ops/runbook.md  ',
        contentRaw: '# Runbook',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ id: 'new-id', builtIn: false }),
    );
    expect(model.create).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      name: 'Runbook',
      description: 'Operations',
      suggestedPath: 'ops/runbook.md',
      contentRaw: '# Runbook',
    });
  });

  it('maps duplicate names to a safe validation error', async () => {
    model.create.mockRejectedValue({ code: 11000 });
    await expect(
      service.create('workspace-a', {
        name: 'Runbook',
        description: '',
        suggestedPath: 'ops/runbook.md',
        contentRaw: '# Runbook',
      }),
    ).rejects.toThrow(
      new BadRequestException('A template with that name already exists'),
    );
  });

  it('updates only a custom template in the requested workspace', async () => {
    model.findOneAndUpdate.mockResolvedValue({
      uuid: 'same-id',
      name: 'Changed',
      description: '',
      suggestedPath: 'guide.md',
      contentRaw: '# Guide',
    });

    await service.update('workspace-b', 'same-id', { name: '  Changed  ' });

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { workspaceId: 'workspace-b', uuid: 'same-id' },
      { $set: { name: 'Changed' } },
      { new: true },
    );
  });

  it('rejects mutation of a built-in template', async () => {
    await expect(
      service.remove('workspace-a', 'builtin:guide'),
    ).rejects.toThrow(
      new BadRequestException('Built-in templates are immutable'),
    );
  });

  it('returns not found for a template outside the workspace', async () => {
    model.deleteOne.mockResolvedValue({ deletedCount: 0 });
    await expect(service.remove('workspace-a', 'missing')).rejects.toThrow(
      new NotFoundException('Document template not found'),
    );
  });
});
