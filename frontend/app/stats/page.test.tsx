import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api';
import {
  getContentAnalytics,
  type ContentAnalytics,
} from '@/lib/api/content-analytics';
import { useProfile } from '@/lib/useProfile';
import StatsPage from './page';

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
  isAbortError: jest.fn((error: unknown) =>
    error instanceof DOMException && error.name === 'AbortError',
  ),
}));
jest.mock('@/lib/api/content-analytics', () => ({
  getContentAnalytics: jest.fn(),
}));
jest.mock('@/lib/useProfile', () => ({
  useProfile: jest.fn(),
}));
jest.mock('@/components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/ui/ThemeSwitcher', () => ({
  ThemeSwitcher: () => null,
}));

const STATS = {
  documents: 2,
  edits: 4,
  contributors: 1,
  reads: 6,
  avgReadTimeMs: 12000,
  activeWatchers: 1,
  topDocuments: [],
  mostWatched: [],
  contributorsList: [],
  editsOverTime: [],
};

const ANALYTICS: ContentAnalytics = {
  periodDays: 30,
  reads: 6,
  uniqueReaders: 1,
  deadPageCount: 0,
  zeroResultSearches: 0,
  mostRead: [],
  deadPages: [],
  searchesWithoutResults: [],
};

function renderPage({ role }: { role: 'owner' | 'editor' | 'viewer' }) {
  jest.mocked(useProfile).mockReturnValue({
    profile: {
      user: {
        id: 'u1',
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        avatarUrl: null,
        username: null,
        bio: null,
      },
      workspaces: [{ id: 'w1', name: 'Docs Team', slug: 'docs-team', role }],
    },
    error: null,
    reload: jest.fn(),
  });
  return render(<StatsPage />);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(apiFetch).mockResolvedValue(STATS);
  jest.mocked(getContentAnalytics).mockResolvedValue(ANALYTICS);
});

it('loads content analytics for owners and aborts the stale request when the period changes', async () => {
  const user = userEvent.setup();
  renderPage({ role: 'owner' });

  await screen.findByRole('heading', { name: 'Content insights' });
  await waitFor(() =>
    expect(getContentAnalytics).toHaveBeenCalledWith(
      'w1',
      30,
      expect.any(AbortSignal),
    ),
  );
  const firstSignal = jest.mocked(getContentAnalytics).mock.calls[0][2];

  await user.click(screen.getByRole('button', { name: '7d' }));

  await waitFor(() =>
    expect(getContentAnalytics).toHaveBeenLastCalledWith(
      'w1',
      7,
      expect.any(AbortSignal),
    ),
  );
  expect(firstSignal?.aborted).toBe(true);
});

it('keeps existing statistics usable when insights fail', async () => {
  jest
    .mocked(getContentAnalytics)
    .mockRejectedValue(new Error('offline'));

  renderPage({ role: 'editor' });

  expect(await screen.findByText('Total reads')).toBeInTheDocument();
  expect(
    await screen.findByText('Could not load content insights'),
  ).toBeInTheDocument();
  expect(screen.getByText('Edits over time')).toBeInTheDocument();
});

it('does not request or render content insights for viewers', async () => {
  renderPage({ role: 'viewer' });

  await screen.findByText('Total reads');
  expect(getContentAnalytics).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('heading', { name: 'Content insights' }),
  ).not.toBeInTheDocument();
});
