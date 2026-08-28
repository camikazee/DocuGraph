import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ContentAnalytics } from '@/lib/api/content-analytics';
import { ContentInsights } from './ContentInsights';

const analytics: ContentAnalytics = {
  periodDays: 30,
  reads: 12,
  uniqueReaders: 4,
  deadPageCount: 1,
  zeroResultSearches: 3,
  mostRead: [
    {
      filePath: 'guides/api.md',
      title: 'API guide',
      reads: 12,
      uniqueReaders: 4,
    },
  ],
  deadPages: [
    {
      filePath: 'guides/old page.md',
      title: 'Old page',
      lastReadAt: null,
      updatedAt: '2026-07-17T00:00:00.000Z',
      inactiveDays: 42,
    },
  ],
  searchesWithoutResults: [
    {
      query: 'missing api',
      count: 3,
      lastSearchedAt: '2026-08-28T00:00:00.000Z',
    },
  ],
};

const emptyAnalytics: ContentAnalytics = {
  periodDays: 7,
  reads: 0,
  uniqueReaders: 0,
  deadPageCount: 0,
  zeroResultSearches: 0,
  mostRead: [],
  deadPages: [],
  searchesWithoutResults: [],
};

describe('ContentInsights', () => {
  it('renders every summary and most-read, dead-page, and missed-search action', () => {
    render(
      <ContentInsights
        analytics={analytics}
        loading={false}
        error={null}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Content insights' })).toBeInTheDocument();
    expect(screen.getByText('30-day period')).toBeInTheDocument();
    expect(screen.getByText('12', { selector: '[data-summary="reads"]' })).toBeInTheDocument();
    expect(screen.getByText('4', { selector: '[data-summary="unique-readers"]' })).toBeInTheDocument();
    expect(screen.getByText('1', { selector: '[data-summary="dead-pages"]' })).toBeInTheDocument();
    expect(screen.getByText('3', { selector: '[data-summary="missed-searches"]' })).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Most read' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /API guide/ })).toHaveAttribute(
      'href',
      '/documents/view?path=guides%2Fapi.md',
    );
    expect(screen.getByText('12 reads · 4 readers')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Dead pages' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Old page/ })).toHaveAttribute(
      'href',
      '/documents/view?path=guides%2Fold%20page.md',
    );
    expect(screen.getByText('42 days inactive')).toBeInTheDocument();
    expect(screen.getByText('Never read')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Searches without results' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /missing api/ })).toHaveAttribute(
      'href',
      '/search?q=missing%20api',
    );
    expect(screen.getByText('3 searches')).toBeInTheDocument();
    expect(screen.getByText(/Latest/)).toBeInTheDocument();
  });

  it('shows honest empty states and a retryable isolated error', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();
    const { rerender } = render(
      <ContentInsights
        analytics={emptyAnalytics}
        loading={false}
        error={null}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('No document reads in this period.')).toBeInTheDocument();
    expect(screen.getByText('Every established page received a read.')).toBeInTheDocument();
    expect(screen.getByText('No searches missed in this period.')).toBeInTheDocument();

    rerender(
      <ContentInsights
        analytics={null}
        loading={false}
        error="Could not load content insights"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Could not load content insights')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the section isolated while loading', () => {
    render(
      <ContentInsights
        analytics={null}
        loading
        error={null}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Content insights' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
