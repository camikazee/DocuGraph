import Link from 'next/link';
import type { ContentAnalytics } from '@/lib/api/content-analytics';
import { Card } from './ui/Card';
import { Loader } from './ui/Loader';

interface ContentInsightsProps {
  analytics: ContentAnalytics | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function documentHref(filePath: string): string {
  return `/documents/view?path=${encodeURIComponent(filePath)}`;
}

function SummaryChip({
  label,
  value,
  name,
}: {
  label: string;
  value: number;
  name: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-capbg px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg3">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-fg" data-summary={name}>
        {value}
      </div>
    </div>
  );
}

function InsightHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15px] font-semibold text-fg">{children}</h3>;
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[13px] leading-relaxed text-fg3">{children}</p>;
}

export function ContentInsights({
  analytics,
  loading,
  error,
  onRetry,
}: ContentInsightsProps) {
  return (
    <section aria-labelledby="content-insights-heading" className="mt-8">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="content-insights-heading" className="text-lg font-semibold text-fg">
          Content insights
        </h2>
        {analytics && (
          <span className="text-xs text-fg3">{analytics.periodDays}-day period</span>
        )}
      </div>

      <Loader loading={loading} error={error} onRetry={onRetry} minHeight={180}>
        {analytics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryChip label="Reads" value={analytics.reads} name="reads" />
              <SummaryChip
                label="Unique readers"
                value={analytics.uniqueReaders}
                name="unique-readers"
              />
              <SummaryChip
                label="Dead pages"
                value={analytics.deadPageCount}
                name="dead-pages"
              />
              <SummaryChip
                label="Missed searches"
                value={analytics.zeroResultSearches}
                name="missed-searches"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="p-5">
                <InsightHeading>Most read</InsightHeading>
                {analytics.mostRead.length === 0 ? (
                  <EmptyMessage>No document reads in this period.</EmptyMessage>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {analytics.mostRead.slice(0, 10).map((item) => (
                      <li key={item.filePath} className="py-3 first:pt-1 last:pb-0">
                        <Link
                          href={documentHref(item.filePath)}
                          className="text-[13.5px] font-medium text-fg hover:text-accfg"
                        >
                          {item.title}
                        </Link>
                        <p className="mt-1 text-xs text-fg3">
                          {item.reads} {item.reads === 1 ? 'read' : 'reads'} ·{' '}
                          {item.uniqueReaders}{' '}
                          {item.uniqueReaders === 1 ? 'reader' : 'readers'}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-5">
                <InsightHeading>Dead pages</InsightHeading>
                {analytics.deadPages.length === 0 ? (
                  <EmptyMessage>Every established page received a read.</EmptyMessage>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {analytics.deadPages.slice(0, 10).map((item) => (
                      <li key={item.filePath} className="py-3 first:pt-1 last:pb-0">
                        <Link
                          href={documentHref(item.filePath)}
                          className="text-[13.5px] font-medium text-fg hover:text-accfg"
                        >
                          {item.title}
                        </Link>
                        <p className="mt-1 text-xs text-fg3">
                          {item.inactiveDays} days inactive
                        </p>
                        <p className="mt-0.5 text-xs text-fg3">
                          {item.lastReadAt
                            ? `Last read ${formatDate(item.lastReadAt)}`
                            : 'Never read'}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-5">
                <InsightHeading>Searches without results</InsightHeading>
                {analytics.searchesWithoutResults.length === 0 ? (
                  <EmptyMessage>No searches missed in this period.</EmptyMessage>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {analytics.searchesWithoutResults.slice(0, 10).map((item) => (
                      <li key={item.query} className="py-3 first:pt-1 last:pb-0">
                        <Link
                          href={`/search?q=${encodeURIComponent(item.query)}`}
                          className="text-[13.5px] font-medium text-fg hover:text-accfg"
                        >
                          {item.query}
                        </Link>
                        <p className="mt-1 text-xs text-fg3">
                          {item.count} {item.count === 1 ? 'search' : 'searches'}
                        </p>
                        <p className="mt-0.5 text-xs text-fg3">
                          Latest {formatDate(item.lastSearchedAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        ) : null}
      </Loader>
    </section>
  );
}
