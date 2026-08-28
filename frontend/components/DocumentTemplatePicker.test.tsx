import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentTemplatePicker } from './DocumentTemplatePicker';
import type { DocumentTemplate } from '@/lib/api/document-templates';

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

describe('DocumentTemplatePicker', () => {
  it('groups templates and emits the selected template', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(
      <DocumentTemplatePicker
        templates={[builtIn, custom]}
        value=""
        onSelect={onSelect}
      />,
    );

    expect(
      screen.getByRole('group', { name: 'Built-in templates' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Workspace templates' }),
    ).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Start from template' }),
      custom.id,
    );
    expect(onSelect).toHaveBeenCalledWith(custom);
  });

  it('emits null for a blank document and describes the active template', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    const { rerender } = render(
      <DocumentTemplatePicker
        templates={[builtIn]}
        value={builtIn.id}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText('Task-focused guide')).toBeInTheDocument();

    rerender(
      <DocumentTemplatePicker
        templates={[builtIn]}
        value={builtIn.id}
        onSelect={onSelect}
        disabled
      />,
    );
    expect(
      screen.getByRole('combobox', { name: 'Start from template' }),
    ).toBeDisabled();

    rerender(
      <DocumentTemplatePicker
        templates={[builtIn]}
        value={builtIn.id}
        onSelect={onSelect}
      />,
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Start from template' }),
      '',
    );
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
