import { render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import AccountPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/account'),
}));
jest.mock('@/lib/auth', () => ({ getToken: jest.fn(), clearToken: jest.fn() }));
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

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ replace: jest.fn(), push: jest.fn() });
  (getToken as jest.Mock).mockReturnValue('tok');
  (apiFetch as jest.Mock).mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(PROFILE);
    return Promise.resolve([]); // documents
  });
});

describe('Account — widok', () => {
  it('renderuje tożsamość, statystyki i zakładki', async () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <AccountPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument(); // inicjały
    expect(screen.getByText('My documentation')).toBeInTheDocument();
    expect(screen.getByText('Your role')).toBeInTheDocument();
  });
});
