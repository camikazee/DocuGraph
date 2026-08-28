import { apiJson, apiVoid } from '../api';
import {
  createFrontmatterSchema,
  deleteFrontmatterSchema,
  listFrontmatterSchemas,
  updateFrontmatterSchema,
  type FrontmatterSchemaInput,
} from './frontmatter-schemas';

jest.mock('../api', () => ({ apiJson: jest.fn(), apiVoid: jest.fn() }));

const input: FrontmatterSchemaInput = {
  name: 'Release',
  description: 'Release metadata',
  fields: [
    {
      key: 'owner',
      label: 'Owner',
      type: 'text',
      required: true,
      options: [],
      defaultValue: '',
    },
  ],
};

describe('frontmatter schema API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(apiJson).mockResolvedValue([]);
    jest.mocked(apiVoid).mockResolvedValue(undefined);
  });

  it('uses encoded workspace schema routes and JSON bodies', async () => {
    await listFrontmatterSchemas('workspace/a');
    expect(apiJson).toHaveBeenCalledWith(
      '/workspaces/workspace%2Fa/frontmatter-schemas',
      { signal: undefined },
    );

    await createFrontmatterSchema('workspace/a', input);
    expect(apiJson).toHaveBeenLastCalledWith(
      '/workspaces/workspace%2Fa/frontmatter-schemas',
      { method: 'POST', body: JSON.stringify(input) },
    );
  });

  it('encodes schema ids and requests a void delete response', async () => {
    await updateFrontmatterSchema('w1', 'schema/1', { name: 'Changed' });
    expect(apiJson).toHaveBeenLastCalledWith(
      '/workspaces/w1/frontmatter-schemas/schema%2F1',
      { method: 'PATCH', body: JSON.stringify({ name: 'Changed' }) },
    );

    await deleteFrontmatterSchema('w1', 'schema/1');
    expect(apiVoid).toHaveBeenLastCalledWith(
      '/workspaces/w1/frontmatter-schemas/schema%2F1',
      { method: 'DELETE' },
    );
  });
});
