import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api';
import {
  createDocumentSnippet,
  deleteDocumentSnippet,
  updateDocumentSnippet,
  type DocumentSnippet,
} from '@/lib/api/document-snippets';
import { DocumentSnippetManager } from './DocumentSnippetManager';

jest.mock('@/lib/api/document-snippets', () => ({
  createDocumentSnippet: jest.fn(),
  updateDocumentSnippet: jest.fn(),
  deleteDocumentSnippet: jest.fn(),
}));

const builtIn: DocumentSnippet = {
  id: 'builtin:checklist',
  name: 'Checklist',
  description: 'Task list',
  contentRaw: '- [ ] Item',
  builtIn: true,
};
const custom: DocumentSnippet = {
  id: 'custom-id',
  name: 'Warning',
  description: 'Notice',
  contentRaw: '> Warning',
  builtIn: false,
};

describe('DocumentSnippetManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createDocumentSnippet).mockResolvedValue(custom);
    jest.mocked(updateDocumentSnippet).mockResolvedValue(custom);
    jest.mocked(deleteDocumentSnippet).mockResolvedValue(undefined);
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(() => jest.restoreAllMocks());

  it('creates a workspace snippet and reloads the library', async () => {
    const user = userEvent.setup();
    const onChanged = jest.fn();
    render(
      <DocumentSnippetManager
        workspaceId="w1"
        snippets={[builtIn]}
        open
        onClose={jest.fn()}
        onChanged={onChanged}
      />,
    );
    await user.type(screen.getByLabelText('Snippet name'), 'Warning');
    await user.type(screen.getByLabelText('Description'), 'Notice');
    await user.type(screen.getByLabelText('Snippet Markdown'), '> Warning');
    await user.click(screen.getByRole('button', { name: 'Create snippet' }));
    expect(createDocumentSnippet).toHaveBeenCalledWith('w1', {
      name: 'Warning',
      description: 'Notice',
      contentRaw: '> Warning',
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('edits and deletes custom snippets but not built-ins', async () => {
    const user = userEvent.setup();
    render(
      <DocumentSnippetManager
        workspaceId="w1"
        snippets={[builtIn, custom]}
        open
        onClose={jest.fn()}
        onChanged={jest.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: `Delete ${builtIn.name}` }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: `Edit ${custom.name}` }),
    );
    await user.clear(screen.getByLabelText('Snippet name'));
    await user.type(screen.getByLabelText('Snippet name'), 'Important warning');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(updateDocumentSnippet).toHaveBeenCalledWith(
      'w1',
      custom.id,
      expect.objectContaining({ name: 'Important warning' }),
    );
    await user.click(
      screen.getByRole('button', { name: `Delete ${custom.name}` }),
    );
    expect(window.confirm).toHaveBeenCalledWith(
      'Delete snippet "Warning"? Documents using it will not change.',
    );
    expect(deleteDocumentSnippet).toHaveBeenCalledWith('w1', custom.id);
  });

  it('keeps values and announces a safe API error', async () => {
    const user = userEvent.setup();
    jest
      .mocked(createDocumentSnippet)
      .mockRejectedValue(new ApiError(400, 'A snippet with that name exists'));
    render(
      <DocumentSnippetManager
        workspaceId="w1"
        snippets={[]}
        open
        onClose={jest.fn()}
        onChanged={jest.fn()}
      />,
    );
    await user.type(screen.getByLabelText('Snippet name'), 'Warning');
    await user.type(screen.getByLabelText('Snippet Markdown'), '> Warning');
    await user.click(screen.getByRole('button', { name: 'Create snippet' }));
    expect(
      await screen.findByText('A snippet with that name exists'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Snippet name')).toHaveValue('Warning');
  });
});
