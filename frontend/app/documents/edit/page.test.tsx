import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import {
  listDocumentSnippets,
  type DocumentSnippet,
} from '@/lib/api/document-snippets';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import EditorPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));
jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
jest.mock('@/lib/auth', () => ({
  getToken: jest.fn(),
  clearToken: jest.fn(),
}));
jest.mock('@/lib/api/document-snippets', () => ({
  listDocumentSnippets: jest.fn(),
}));
jest.mock('@/components/DocumentSnippetManager', () => ({
  DocumentSnippetManager: ({
    open,
    onChanged,
  }: {
    open: boolean;
    onChanged: () => void;
  }) => (open ? <button onClick={onChanged}>Reload snippets</button> : null),
}));

const PROFILE = {
  user: {
    id: 'u1',
    email: 'owner@example.com',
    name: 'Owner',
    avatarUrl: null,
    username: null,
    bio: null,
  },
  workspaces: [{ id: 'w1', name: 'Docs', slug: 'docs', role: 'owner' }],
};
const checklist: DocumentSnippet = {
  id: 'builtin:checklist',
  name: 'Checklist',
  description: 'Task list',
  contentRaw: '- [ ] Item',
  builtIn: true,
};

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <EditorPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getToken).mockReturnValue('token');
  jest.mocked(useRouter).mockReturnValue({
    back: jest.fn(),
    replace: jest.fn(),
  } as unknown as ReturnType<typeof useRouter>);
  jest.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>,
  );
  jest.mocked(apiFetch).mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(PROFILE);
    if (path.endsWith('/documents')) return Promise.resolve([]);
    return Promise.resolve([]);
  });
  jest.mocked(listDocumentSnippets).mockResolvedValue([checklist]);
});

describe('Document editor snippets', () => {
  it('replaces the current selection and restores the caret', async () => {
    const user = userEvent.setup();
    renderPage();
    const editor = await screen.findByRole('textbox', {
      name: 'Markdown editor',
    });
    fireEvent.change(editor, { target: { value: 'Before OLD After' } });
    (editor as HTMLTextAreaElement).setSelectionRange(7, 10);

    await user.click(screen.getByRole('button', { name: 'Snippets' }));
    await user.click(
      screen.getByRole('button', { name: 'Insert Checklist' }),
    );

    expect(editor).toHaveValue('Before \n\n- [ ] Item\n\n After');
    await waitFor(() => {
      expect((editor as HTMLTextAreaElement).selectionStart).toBe(19);
      expect(editor).toHaveFocus();
    });
  });

  it('keeps editing usable when snippet loading fails', async () => {
    jest.mocked(listDocumentSnippets).mockRejectedValue(new Error('offline'));
    renderPage();
    expect(
      await screen.findByRole('textbox', { name: 'Markdown editor' }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Snippets' })).toBeEnabled();
  });

  it('reloads the library without changing the current document', async () => {
    const user = userEvent.setup();
    renderPage();
    const editor = await screen.findByRole('textbox', {
      name: 'Markdown editor',
    });
    fireEvent.change(editor, { target: { value: '# Work in progress' } });
    await user.click(screen.getByRole('button', { name: 'Snippets' }));
    await user.click(screen.getByRole('button', { name: 'Manage snippets' }));
    await user.click(screen.getByRole('button', { name: 'Reload snippets' }));

    expect(listDocumentSnippets).toHaveBeenCalledTimes(2);
    expect(editor).toHaveValue('# Work in progress');
  });
});
