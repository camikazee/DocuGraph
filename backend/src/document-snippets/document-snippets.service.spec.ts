import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { DocumentSnippetsService } from './document-snippets.service';
import { DocumentSnippet } from './schemas/document-snippet.schema';

function query<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('DocumentSnippetsService', () => {
  const model = {
    find: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
  };
  let service: DocumentSnippetsService;

  const validInput = {
    name: 'Warning',
    description: '',
    contentRaw: '> Warning',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DocumentSnippetsService,
        { provide: getModelToken(DocumentSnippet.name), useValue: model },
      ],
    }).compile();
    service = module.get(DocumentSnippetsService);
  });

  it('lists built-ins before workspace snippets without leaking _id', async () => {
    model.find.mockReturnValue(
      query([
        {
          _id: 'internal',
          uuid: 'custom-id',
          name: 'Warning',
          description: '',
          contentRaw: '> Warning',
        },
      ]),
    );
    const result = await service.list('workspace-a');
    expect(result[0]).toEqual(
      expect.objectContaining({ id: 'builtin:code-block', builtIn: true }),
    );
    expect(result.at(-1)).toEqual({
      id: 'custom-id',
      name: 'Warning',
      description: '',
      contentRaw: '> Warning',
      builtIn: false,
    });
    expect(result.at(-1)).not.toHaveProperty('_id');
    expect(model.find).toHaveBeenCalledWith({ workspaceId: 'workspace-a' });
  });

  it('creates trimmed metadata and preserves Markdown', async () => {
    model.create.mockResolvedValue({ uuid: 'new-id', ...validInput });
    await service.create('workspace-a', {
      name: ' Warning ',
      description: ' Notice ',
      contentRaw: '  indented\n',
    });
    expect(model.create).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      name: 'Warning',
      description: 'Notice',
      contentRaw: '  indented\n',
    });
  });

  it('scopes update by workspace', async () => {
    model.findOneAndUpdate.mockResolvedValue({
      uuid: 'same-id',
      name: 'Changed',
      description: '',
      contentRaw: '> Changed',
    });
    await service.update('workspace-b', 'same-id', { name: ' Changed ' });
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { workspaceId: 'workspace-b', uuid: 'same-id' },
      { $set: { name: 'Changed' } },
      { new: true },
    );
  });

  it('maps duplicate names to a safe validation error', async () => {
    model.create.mockRejectedValue({ code: 11000 });
    await expect(service.create('workspace-b', validInput)).rejects.toThrow(
      new BadRequestException('A snippet with that name already exists'),
    );
  });

  it('rejects mutation of a built-in snippet', async () => {
    await expect(
      service.remove('workspace-a', 'builtin:checklist'),
    ).rejects.toThrow(
      new BadRequestException('Built-in snippets are immutable'),
    );
  });

  it('returns not found outside the requested workspace', async () => {
    model.deleteOne.mockResolvedValue({ deletedCount: 0 });
    await expect(service.remove('workspace-a', 'missing')).rejects.toThrow(
      new NotFoundException('Document snippet not found'),
    );
  });
});
