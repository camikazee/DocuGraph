import { render, screen, fireEvent } from '@testing-library/react';
import { apiFetch } from '@/lib/api';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { ShareDialog } from './ShareDialog';

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

function renderDialog() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ShareDialog ws="w1" filePath="guide.md" onClose={jest.fn()} />
      </ToastProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('ShareDialog', () => {
  it('shows no links initially, then reveals the URL once after creating', async () => {
    (apiFetch as jest.Mock).mockImplementation(
      (path: string, opts?: { method?: string }) => {
        if (opts?.method === 'POST')
          return Promise.resolve({ url: 'https://app/share/dgs_secret' });
        return Promise.resolve([]); // GET list (before and after)
      },
    );

    renderDialog();

    expect(await screen.findByText(/no public links yet/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /create link/i }));

    // the full link is surfaced exactly once, in a readonly input
    const input = (await screen.findByDisplayValue(
      'https://app/share/dgs_secret',
    )) as HTMLInputElement;
    expect(input).toHaveAttribute('readonly');
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
  });

  it('lists an active link returned by the API', async () => {
    (apiFetch as jest.Mock).mockResolvedValue([
      { id: 'l1', createdAt: new Date().toISOString(), expiresAt: null },
    ]);

    renderDialog();

    expect(await screen.findByText(/no expiry/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /revoke/i }),
    ).toBeInTheDocument();
  });
});
