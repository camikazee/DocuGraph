import { Model } from 'mongoose';
import { DocumentEntityDocument } from './schemas/document.schema';
import { DocumentConsistencyService } from './document-consistency.service';
import { WorkspaceStorageService } from './workspace-storage.service';

describe('DocumentConsistencyService', () => {
  it('reports missing files, missing index rows, and content differences', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        { filePath: 'ok.md', contentRaw: '# OK' },
        { filePath: 'missing.md', contentRaw: '# Missing' },
        { filePath: 'changed.md', contentRaw: '# Indexed' },
      ]),
    };
    const model = { find: jest.fn().mockReturnValue(query) };
    const storage = {
      listFiles: jest.fn().mockResolvedValue(['ok.md', 'changed.md', 'new.md']),
      readFile: jest.fn(async (_workspaceId: string, filePath: string) =>
        filePath === 'changed.md' ? '# On disk' : '# OK',
      ),
    };
    const service = new DocumentConsistencyService(
      model as unknown as Model<DocumentEntityDocument>,
      storage as unknown as WorkspaceStorageService,
    );

    await expect(service.check('ws')).resolves.toEqual({
      ok: false,
      missingOnDisk: ['missing.md'],
      missingInIndex: ['new.md'],
      contentMismatch: ['changed.md'],
    });
    expect(model.find).toHaveBeenCalledWith({ workspaceId: 'ws' });
  });
});
