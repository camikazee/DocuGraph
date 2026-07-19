import { render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
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

const PROFILE = {
  user: { id: 'u1', email: 'a@b.co', name: 'Ada', avatarUrl: null, username: null, bio: null },
  workspaces: [{ id: 'w1', name: 'Docs', slug: 'docs', role: 'owner' }],
};

function mockApi(docs: unknown[]) {
  (apiFetch as jest.Mock).mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(PROFILE);
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
});
