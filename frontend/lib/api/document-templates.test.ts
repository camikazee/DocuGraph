import { apiJson, apiVoid } from '../api';
import {
  createDocumentTemplate,
  deleteDocumentTemplate,
  listDocumentTemplates,
  updateDocumentTemplate,
} from './document-templates';

jest.mock('../api', () => ({
  apiJson: jest.fn(),
  apiVoid: jest.fn(),
}));

const input = {
  name: 'Runbook',
  description: '',
  suggestedPath: 'ops/runbook.md',
  contentRaw: '# Runbook',
};

describe('document template API', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the workspace collection for reads and mutations', async () => {
    jest.mocked(apiJson).mockResolvedValue([]);
    jest.mocked(apiVoid).mockResolvedValue(undefined);

    await listDocumentTemplates('w1');
    await createDocumentTemplate('w1', input);
    await updateDocumentTemplate('w1', 't1', { name: 'Changed' });
    await deleteDocumentTemplate('w1', 't1');

    expect(apiJson).toHaveBeenNthCalledWith(
      1,
      '/workspaces/w1/document-templates',
      { signal: undefined },
    );
    expect(apiJson).toHaveBeenNthCalledWith(
      2,
      '/workspaces/w1/document-templates',
      { method: 'POST', body: JSON.stringify(input) },
    );
    expect(apiJson).toHaveBeenNthCalledWith(
      3,
      '/workspaces/w1/document-templates/t1',
      { method: 'PATCH', body: JSON.stringify({ name: 'Changed' }) },
    );
    expect(apiVoid).toHaveBeenCalledWith(
      '/workspaces/w1/document-templates/t1',
      { method: 'DELETE' },
    );
  });

  it('encodes template ids in item paths', async () => {
    jest.mocked(apiVoid).mockResolvedValue(undefined);
    await deleteDocumentTemplate('w1', 'custom/id:1');
    expect(apiVoid).toHaveBeenCalledWith(
      '/workspaces/w1/document-templates/custom%2Fid%3A1',
      { method: 'DELETE' },
    );
  });
});
