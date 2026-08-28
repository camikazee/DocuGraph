import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import {
  listDocumentTemplates,
  type DocumentTemplate,
} from '@/lib/api/document-templates';
import { getToken } from '@/lib/auth';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import DocumentsPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/documents'),
}));
jest.mock('@/lib/auth', () => ({ getToken: jest.fn(), clearToken: jest.fn() }));
jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
  apiBaseUrl: 'http://test/api/v1',
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
jest.mock('@/lib/api/document-templates', () => ({
  listDocumentTemplates: jest.fn(),
}));
jest.mock('@/components/DocumentTemplateManager', () => ({
  DocumentTemplateManager: ({
    open,
    onChanged,
  }: {
    open: boolean;
    onChanged: () => void;
  }) =>
    open ? (
      <button onClick={onChanged}>Simulate template change</button>
    ) : null,
}));

const PROFILE = {
  user: { id: 'u1', email: 'a@b.co', name: 'Ada', avatarUrl: null, username: null, bio: null },
  workspaces: [{ id: 'w1', name: 'Docs', slug: 'docs', role: 'owner' }],
};

function mockApi(docs: unknown[], profile = PROFILE) {
  (apiFetch as jest.Mock).mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(profile);
    if (path.endsWith('/documents')) return Promise.resolve(docs);
    if (path.endsWith('/members')) return Promise.resolve([]);
    return Promise.resolve([]);
  });
}

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <DocumentsPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (getToken as jest.Mock).mockReturnValue('tok');
  jest.mocked(listDocumentTemplates).mockResolvedValue([]);
});

describe('Documents — empty & onboarding states', () => {
  it('shows first-run onboarding with CTAs when the workspace has no docs', async () => {
    mockApi([]);
    renderPage();

    expect(
      await screen.findByText(/your workspace is empty/i),
    ).toBeInTheDocument();
    // onboarding CTAs (header also has a "New document" button, so assert the
    // ones unique to the empty state)
    expect(
      screen.getByRole('link', { name: /connect a repo/i }),
    ).toBeInTheDocument();
    // both the header and the onboarding offer "New document"
    expect(
      screen.getAllByRole('button', { name: 'New document' }).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('lists documents when the workspace has them', async () => {
    mockApi([
      {
        filePath: 'guide.md',
        title: 'Guide',
        updatedAt: new Date().toISOString(),
        status: 'published',
        tags: [],
        updatedBy: 'u1',
        reads: 0,
      },
    ]);
    renderPage();

    expect(await screen.findByText('Guide')).toBeInTheDocument();
    expect(screen.queryByText(/your workspace is empty/i)).not.toBeInTheDocument();
  });

  it('prefills an editable form from a template and saves through documents API', async () => {
    const user = userEvent.setup();
    const guide: DocumentTemplate = {
      id: 'builtin:guide',
      name: 'How-to guide',
      description: 'Task-focused guide',
      suggestedPath: 'guides/how-to.md',
      contentRaw: '# How-to guide',
      builtIn: true,
    };
    jest.mocked(listDocumentTemplates).mockResolvedValue([guide]);
    mockApi([]);
    renderPage();

    await user.click(
      (await screen.findAllByRole('button', { name: 'New document' }))[0],
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Start from template' }),
      guide.id,
    );
    expect(screen.getByLabelText('File path')).toHaveValue(
      'guides/how-to.md',
    );
    expect(screen.getByLabelText('Markdown')).toHaveValue('# How-to guide');

    fireEvent.change(screen.getByLabelText('Markdown'), {
      target: { value: '# How-to guide\n\nCustom line' },
    });
    await user.click(screen.getByRole('button', { name: 'Save document' }));
    expect(apiFetch).toHaveBeenCalledWith('/workspaces/w1/documents', {
      method: 'POST',
      body: JSON.stringify({
        file_path: 'guides/how-to.md',
        content_raw: '# How-to guide\n\nCustom line',
      }),
    });
  });

  it('keeps draft values when the template library reloads', async () => {
    const user = userEvent.setup();
    mockApi([]);
    renderPage();
    await user.click(
      (await screen.findAllByRole('button', { name: 'New document' }))[0],
    );
    fireEvent.change(screen.getByLabelText('File path'), {
      target: { value: 'draft.md' },
    });
    fireEvent.change(screen.getByLabelText('Markdown'), {
      target: { value: '# Draft in progress' },
    });
    await user.click(screen.getByRole('button', { name: 'Manage templates' }));
    await user.click(
      screen.getByRole('button', { name: 'Simulate template change' }),
    );

    expect(listDocumentTemplates).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('File path')).toHaveValue('draft.md');
    expect(screen.getByLabelText('Markdown')).toHaveValue(
      '# Draft in progress',
    );
  });

  it('does not show template management to a viewer', async () => {
    mockApi([], {
      ...PROFILE,
      workspaces: [{ ...PROFILE.workspaces[0], role: 'viewer' }],
    });
    renderPage();
    await screen.findByText(/your workspace is empty/i);
    expect(
      screen.queryByRole('button', { name: 'Manage templates' }),
    ).not.toBeInTheDocument();
  });
});
