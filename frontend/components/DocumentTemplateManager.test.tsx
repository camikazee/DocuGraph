import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api';
import {
  createDocumentTemplate,
  deleteDocumentTemplate,
  updateDocumentTemplate,
  type DocumentTemplate,
} from '@/lib/api/document-templates';
import { DocumentTemplateManager } from './DocumentTemplateManager';

jest.mock('@/lib/api/document-templates', () => ({
  createDocumentTemplate: jest.fn(),
  updateDocumentTemplate: jest.fn(),
  deleteDocumentTemplate: jest.fn(),
}));

const builtIn: DocumentTemplate = {
  id: 'builtin:guide',
  name: 'How-to guide',
  description: 'Task-focused guide',
  suggestedPath: 'guides/how-to.md',
  contentRaw: '# Guide',
  builtIn: true,
};
const custom: DocumentTemplate = {
  id: 'custom-id',
  name: 'Runbook',
  description: 'Operations guide',
  suggestedPath: 'ops/runbook.md',
  contentRaw: '# Runbook',
  builtIn: false,
};

describe('DocumentTemplateManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createDocumentTemplate).mockResolvedValue(custom);
    jest.mocked(updateDocumentTemplate).mockResolvedValue(custom);
    jest.mocked(deleteDocumentTemplate).mockResolvedValue(undefined);
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates a workspace template and asks the parent to reload', async () => {
    const user = userEvent.setup();
    const onChanged = jest.fn();
    render(
      <DocumentTemplateManager
        workspaceId="w1"
        templates={[builtIn]}
        open
        onClose={jest.fn()}
        onChanged={onChanged}
      />,
    );

    await user.type(screen.getByLabelText('Template name'), 'Runbook');
    await user.type(
      screen.getByLabelText('Suggested path'),
      'ops/runbook.md',
    );
    await user.type(screen.getByLabelText('Template Markdown'), '# Runbook');
    await user.click(screen.getByRole('button', { name: 'Create template' }));

    expect(createDocumentTemplate).toHaveBeenCalledWith('w1', {
      name: 'Runbook',
      description: '',
      suggestedPath: 'ops/runbook.md',
      contentRaw: '# Runbook',
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('edits and deletes custom templates but not built-ins', async () => {
    const user = userEvent.setup();
    const onChanged = jest.fn();
    render(
      <DocumentTemplateManager
        workspaceId="w1"
        templates={[builtIn, custom]}
        open
        onClose={jest.fn()}
        onChanged={onChanged}
      />,
    );

    expect(
      screen.queryByRole('button', { name: `Delete ${builtIn.name}` }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: `Edit ${custom.name}` }),
    );
    await user.clear(screen.getByLabelText('Template name'));
    await user.type(screen.getByLabelText('Template name'), 'Incident runbook');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(updateDocumentTemplate).toHaveBeenCalledWith(
      'w1',
      custom.id,
      expect.objectContaining({ name: 'Incident runbook' }),
    );

    await user.click(
      screen.getByRole('button', { name: `Delete ${custom.name}` }),
    );
    expect(window.confirm).toHaveBeenCalledWith(
      'Delete template "Runbook"? Documents already created from it will not change.',
    );
    expect(deleteDocumentTemplate).toHaveBeenCalledWith('w1', custom.id);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('keeps form data and announces a safe API error', async () => {
    const user = userEvent.setup();
    jest
      .mocked(createDocumentTemplate)
      .mockRejectedValue(new ApiError(400, 'A template with that name exists'));
    render(
      <DocumentTemplateManager
        workspaceId="w1"
        templates={[]}
        open
        onClose={jest.fn()}
        onChanged={jest.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Template name'), 'Runbook');
    await user.type(screen.getByLabelText('Suggested path'), 'runbook.md');
    await user.type(screen.getByLabelText('Template Markdown'), '# Runbook');
    await user.click(screen.getByRole('button', { name: 'Create template' }));

    expect(
      await screen.findByText('A template with that name exists'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Template name')).toHaveValue('Runbook');
  });
});
