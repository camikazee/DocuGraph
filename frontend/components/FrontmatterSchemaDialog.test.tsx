import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FrontmatterSchema } from '@/lib/api/frontmatter-schemas';
import { FrontmatterSchemaDialog } from './FrontmatterSchemaDialog';

const basic: FrontmatterSchema = {
  id: 'builtin:basic',
  name: 'Basic document',
  description: 'Common metadata',
  builtIn: true,
  fields: [
    { key: 'title', label: 'Title', type: 'text', required: false, options: [], defaultValue: '' },
    { key: 'tags', label: 'Tags', type: 'list', required: false, options: [], defaultValue: '' },
    { key: 'priority', label: 'Priority', type: 'number', required: false, options: [], defaultValue: '1' },
    { key: 'published', label: 'Published', type: 'boolean', required: false, options: [], defaultValue: 'false' },
    { key: 'reviewed', label: 'Reviewed', type: 'date', required: false, options: [], defaultValue: '' },
    { key: 'status', label: 'Status', type: 'select', required: false, options: ['draft', 'published'], defaultValue: 'draft' },
  ],
};

const requiredSchema: FrontmatterSchema = {
  id: 'schema-1',
  name: 'Ownership',
  description: '',
  builtIn: false,
  fields: [
    { key: 'owner', label: 'Owner', type: 'text', required: true, options: [], defaultValue: '' },
  ],
};

describe('FrontmatterSchemaDialog', () => {
  it('prefills fields from Markdown and applies the selected schema', async () => {
    const user = userEvent.setup();
    const onApply = jest.fn();
    render(
      <FrontmatterSchemaDialog
        schemas={[basic]}
        content={'---\ntitle: Old\nstatus: draft\n---\n\n# Body'}
        open
        onClose={jest.fn()}
        onApply={onApply}
        onManage={jest.fn()}
        canManage
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Old');
    expect(screen.getByRole('spinbutton', { name: 'Priority' })).toHaveValue(1);
    expect(screen.getByRole('combobox', { name: 'Published' })).toHaveValue('false');
    expect(screen.getByText('Comma-separated values')).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Title' }));
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'New title');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'published');
    await user.click(screen.getByRole('button', { name: 'Apply frontmatter' }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ value: expect.stringContaining('title: "New title"') }),
    );
  });

  it('re-seeds values when the selected schema changes and opens management', async () => {
    const user = userEvent.setup();
    const onManage = jest.fn();
    render(
      <FrontmatterSchemaDialog
        schemas={[basic, requiredSchema]}
        content={'---\nowner: platform\n---\n# Body'}
        open
        onClose={jest.fn()}
        onApply={jest.fn()}
        onManage={onManage}
        canManage
      />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Schema' }), requiredSchema.id);
    expect(screen.getByRole('textbox', { name: 'Owner' })).toHaveValue('platform');
    await user.click(screen.getByRole('button', { name: 'Manage schemas' }));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it('shows validation without changing the document and hides management from viewers', async () => {
    const user = userEvent.setup();
    const onApply = jest.fn();
    render(
      <FrontmatterSchemaDialog
        schemas={[requiredSchema]}
        content="# Body"
        open
        onClose={jest.fn()}
        onApply={onApply}
        onManage={jest.fn()}
        canManage={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Apply frontmatter' }));
    expect(screen.getByText('Owner is required')).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Manage schemas' })).not.toBeInTheDocument();
  });
});
