import { render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import DashboardPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/dashboard'),
}));
jest.mock('@/lib/auth', () => ({
  getToken: jest.fn(),
  clearToken: jest.fn(),
}));
jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const PROFILE = {
  user: {
    id: 'u1',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    avatarUrl: null,
    username: null,
    bio: null,
  },
  workspaces: [{ id: 'w1', name: 'Docs Team', slug: 'docs-team', role: 'owner' }],
};

const replace = jest.fn();

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(PROFILE);
    if (path.endsWith('/documents'))
      return Promise.resolve([
        {
          filePath: 'a.md',
          title: 'Doc A',
          updatedAt: new Date().toISOString(),
          status: 'published',
          updatedBy: 'u1',
        },
      ]);
    if (path.endsWith('/members'))
      return Promise.resolve([{ userId: 'u1', name: 'Ada Lovelace', avatarUrl: null }]);
    if (path.endsWith('/graph')) return Promise.resolve({ nodes: [], edges: [] });
    if (path.endsWith('/stats'))
      return Promise.resolve({ edits: 1, contributors: 1, editsOverTime: [] });
    return Promise.resolve([]); // broken-links, etc.
  });
}

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <DashboardPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ replace, push: jest.fn() });
});

describe('Dashboard — widok', () => {
  it('renderuje powitanie, workspace i ostatnie dokumenty', async () => {
    (getToken as jest.Mock).mockReturnValue('tok');
    mockApi();

    renderPage();

    expect(
      await screen.findByRole('heading', { name: /Ada/ }),
    ).toBeInTheDocument();
    // treść w <Loader> pojawia się po załadowaniu danych
    expect(await screen.findByText('Doc A')).toBeInTheDocument();
    expect(screen.getByText('Docs Team')).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Recent activity')).toBeInTheDocument();
    expect(screen.getByText('Watching')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument();
  });

  it('przekierowuje na /login, gdy brak tokena', async () => {
    (getToken as jest.Mock).mockReturnValue(null);

    renderPage();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });
});
