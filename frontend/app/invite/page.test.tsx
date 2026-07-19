import { render, screen, waitFor } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import InvitePage from './page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));
jest.mock('@/lib/auth', () => ({ getToken: jest.fn() }));
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

const replace = jest.fn();

function setToken(token: string | null) {
  (useSearchParams as jest.Mock).mockReturnValue(
    new URLSearchParams(token ? `token=${token}` : ''),
  );
}

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <InvitePage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ replace, push: jest.fn() });
});

describe('Invite page', () => {
  it('accepts the invite and redirects when already signed in', async () => {
    setToken('abc');
    (getToken as jest.Mock).mockReturnValue('jwt');
    (apiFetch as jest.Mock).mockResolvedValue({ workspaceId: 'w1' });

    renderPage();

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/invitations/accept',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('prompts to sign in when not authenticated, carrying next', async () => {
    setToken('abc');
    (getToken as jest.Mock).mockReturnValue(null);

    renderPage();

    expect(
      await screen.findByText(/you've been invited/i),
    ).toBeInTheDocument();
    const signIn = screen.getByRole('link', { name: /sign in to accept/i });
    expect(signIn).toHaveAttribute(
      'href',
      expect.stringContaining('next=%2Finvite%3Ftoken%3Dabc'),
    );
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('shows a helpful message when the token is missing', async () => {
    setToken(null);
    (getToken as jest.Mock).mockReturnValue('jwt');

    renderPage();

    expect(
      await screen.findByText(/missing invitation token/i),
    ).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('surfaces an error when the invite cannot be accepted', async () => {
    setToken('bad');
    (getToken as jest.Mock).mockReturnValue('jwt');
    const { ApiError } = jest.requireMock('@/lib/api');
    (apiFetch as jest.Mock).mockRejectedValue(
      new ApiError(410, 'Invitation has expired'),
    );

    renderPage();

    expect(
      await screen.findByText(/invitation has expired/i),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
