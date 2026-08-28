import { apiJson, apiVoid } from '../api';
import {
  createDocumentSnippet,
  deleteDocumentSnippet,
  listDocumentSnippets,
  updateDocumentSnippet,
} from './document-snippets';

jest.mock('../api', () => ({ apiJson: jest.fn(), apiVoid: jest.fn() }));

const input = {
  name: 'Warning',
  description: '',
  contentRaw: '> Warning',
};

describe('document snippet API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(apiJson).mockResolvedValue([]);
    jest.mocked(apiVoid).mockResolvedValue(undefined);
  });

  it('uses the workspace collection for reads and mutations', async () => {
    await listDocumentSnippets('w1');
    await createDocumentSnippet('w1', input);
    await updateDocumentSnippet('w1', 's1', { name: 'Changed' });
    await deleteDocumentSnippet('w1', 's1');

    expect(apiJson).toHaveBeenNthCalledWith(
      1,
      '/workspaces/w1/document-snippets',
      { signal: undefined },
    );
    expect(apiJson).toHaveBeenNthCalledWith(
      2,
      '/workspaces/w1/document-snippets',
      { method: 'POST', body: JSON.stringify(input) },
    );
    expect(apiJson).toHaveBeenNthCalledWith(
      3,
      '/workspaces/w1/document-snippets/s1',
      { method: 'PATCH', body: JSON.stringify({ name: 'Changed' }) },
    );
    expect(apiVoid).toHaveBeenCalledWith(
      '/workspaces/w1/document-snippets/s1',
      { method: 'DELETE' },
    );
  });

  it('encodes snippet ids in item paths', async () => {
    await deleteDocumentSnippet('w1', 'custom/id:1');
    expect(apiVoid).toHaveBeenCalledWith(
      '/workspaces/w1/document-snippets/custom%2Fid%3A1',
      { method: 'DELETE' },
    );
  });
});
