import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api';
import {
  createFrontmatterSchema,
  deleteFrontmatterSchema,
  updateFrontmatterSchema,
  type FrontmatterSchema,
} from '@/lib/api/frontmatter-schemas';
import { FrontmatterSchemaManager } from './FrontmatterSchemaManager';

jest.mock('@/lib/api/frontmatter-schemas', () => ({
  ...jest.requireActual('@/lib/api/frontmatter-schemas'),
  createFrontmatterSchema: jest.fn(),
  updateFrontmatterSchema: jest.fn(),
  deleteFrontmatterSchema: jest.fn(),
}));

const builtIn: FrontmatterSchema = {
  id: 'builtin:basic',
  name: 'Basic document',
  description: 'Common metadata',
  builtIn: true,
  fields: [{ key: 'title', label: 'Title', type: 'text', required: false, options: [], defaultValue: '' }],
};
const custom: FrontmatterSchema = {
  id: 'schema-1',
  name: 'Release',
  description: 'Deployment metadata',
  builtIn: false,
  fields: [{ key: 'owner', label: 'Owner', type: 'text', required: true, options: [], defaultValue: '' }],
};

describe('FrontmatterSchemaManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createFrontmatterSchema).mockResolvedValue(custom);
    jest.mocked(updateFrontmatterSchema).mockResolvedValue(custom);
    jest.mocked(deleteFrontmatterSchema).mockResolvedValue(undefined);
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(() => jest.restoreAllMocks());

  it('creates a schema with ordered dynamic fields and select options', async () => {
    const user = userEvent.setup();
    const onChanged = jest.fn();
    render(<FrontmatterSchemaManager workspaceId="w1" schemas={[builtIn]} open onClose={jest.fn()} onChanged={onChanged} />);

    await user.type(screen.getByLabelText('Schema name'), 'Release');
    await user.type(screen.getByLabelText('Description'), 'Deployment metadata');
    const first = screen.getByRole('group', { name: 'Field 1' });
    await user.type(within(first).getByLabelText('Key'), 'owner');
    await user.type(within(first).getByLabelText('Label'), 'Owner');
    await user.click(within(first).getByRole('checkbox', { name: 'Required' }));
    await user.click(screen.getByRole('button', { name: 'Add field' }));
    const second = screen.getByRole('group', { name: 'Field 2' });
    await user.type(within(second).getByLabelText('Key'), 'stage');
    await user.type(within(second).getByLabelText('Label'), 'Stage');
    await user.selectOptions(within(second).getByLabelText('Type'), 'select');
    await user.type(within(second).getByLabelText('Options'), 'draft\npublished');
    await user.type(within(second).getByLabelText('Default value'), 'draft');
    await user.click(screen.getByRole('button', { name: 'Create schema' }));

    expect(createFrontmatterSchema).toHaveBeenCalledWith('w1', {
      name: 'Release',
      description: 'Deployment metadata',
      fields: [
        { key: 'owner', label: 'Owner', type: 'text', required: true, options: [], defaultValue: '' },
        { key: 'stage', label: 'Stage', type: 'select', required: false, options: ['draft', 'published'], defaultValue: 'draft' },
      ],
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('edits and deletes custom schemas while built-ins stay read-only', async () => {
    const user = userEvent.setup();
    const onChanged = jest.fn();
    render(<FrontmatterSchemaManager workspaceId="w1" schemas={[builtIn, custom]} open onClose={jest.fn()} onChanged={onChanged} />);

    expect(screen.queryByRole('button', { name: `Edit ${builtIn.name}` })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Delete ${builtIn.name}` })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `Edit ${custom.name}` }));
    await user.clear(screen.getByLabelText('Schema name'));
    await user.type(screen.getByLabelText('Schema name'), 'Release notes');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(updateFrontmatterSchema).toHaveBeenCalledWith('w1', custom.id, expect.objectContaining({ name: 'Release notes' }));

    await user.click(screen.getByRole('button', { name: `Delete ${custom.name}` }));
    expect(window.confirm).toHaveBeenCalledWith('Delete schema "Release"? Existing document frontmatter will not change.');
    expect(deleteFrontmatterSchema).toHaveBeenCalledWith('w1', custom.id);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('validates field rows before the API request', async () => {
    const user = userEvent.setup();
    render(<FrontmatterSchemaManager workspaceId="w1" schemas={[]} open onClose={jest.fn()} onChanged={jest.fn()} />);
    await user.type(screen.getByLabelText('Schema name'), 'Invalid');
    await user.click(screen.getByRole('button', { name: 'Create schema' }));
    expect(screen.getByText('Every field needs a key and label')).toBeInTheDocument();
    expect(createFrontmatterSchema).not.toHaveBeenCalled();
  });

  it('keeps all form values and announces an ApiError', async () => {
    const user = userEvent.setup();
    jest.mocked(createFrontmatterSchema).mockRejectedValue(new ApiError(400, 'A frontmatter schema with that name already exists'));
    render(<FrontmatterSchemaManager workspaceId="w1" schemas={[]} open onClose={jest.fn()} onChanged={jest.fn()} />);
    await user.type(screen.getByLabelText('Schema name'), 'Release');
    const row = screen.getByRole('group', { name: 'Field 1' });
    await user.type(within(row).getByLabelText('Key'), 'owner');
    await user.type(within(row).getByLabelText('Label'), 'Owner');
    await user.click(screen.getByRole('button', { name: 'Create schema' }));

    expect(await screen.findByText('A frontmatter schema with that name already exists')).toBeInTheDocument();
    expect(screen.getByLabelText('Schema name')).toHaveValue('Release');
    expect(within(screen.getByRole('group', { name: 'Field 1' })).getByLabelText('Key')).toHaveValue('owner');
  });
});
