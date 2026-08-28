import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DocumentSnippet } from '@/lib/api/document-snippets';
import { DocumentSnippetPicker } from './DocumentSnippetPicker';

const checklist: DocumentSnippet = {
  id: 'builtin:checklist',
  name: 'Checklist',
  description: 'Task list',
  contentRaw: '- [ ] Item',
  builtIn: true,
};
const mermaid: DocumentSnippet = {
  id: 'builtin:mermaid',
  name: 'Mermaid flowchart',
  description: 'Diagram',
  contentRaw: '```mermaid\n```',
  builtIn: true,
};

describe('DocumentSnippetPicker', () => {
  it('filters snippets and emits the chosen built-in', async () => {
    const user = userEvent.setup();
    const onInsert = jest.fn();
    render(
      <DocumentSnippetPicker
        snippets={[checklist, mermaid]}
        open
        onClose={jest.fn()}
        onInsert={onInsert}
        onManage={jest.fn()}
        canManage
      />,
    );
    await user.type(
      screen.getByRole('searchbox', { name: 'Filter snippets' }),
      'check',
    );
    expect(
      screen.getByRole('button', { name: 'Insert Checklist' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Insert Mermaid flowchart' }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Insert Checklist' }),
    );
    expect(onInsert).toHaveBeenCalledWith(checklist);
  });

  it('shows an empty filter result and hides management from viewers', async () => {
    const user = userEvent.setup();
    render(
      <DocumentSnippetPicker
        snippets={[checklist]}
        open
        onClose={jest.fn()}
        onInsert={jest.fn()}
        onManage={jest.fn()}
        canManage={false}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Manage snippets' }),
    ).not.toBeInTheDocument();
    await user.type(
      screen.getByRole('searchbox', { name: 'Filter snippets' }),
      'missing',
    );
    expect(screen.getByText('No snippets match this filter.')).toBeInTheDocument();
  });
});
