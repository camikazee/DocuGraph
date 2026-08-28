import { apiJson } from '../api';

export type ContentAnalyticsPeriod = 7 | 30 | 90;

export interface ContentAnalytics {
  periodDays: ContentAnalyticsPeriod;
  reads: number;
  uniqueReaders: number;
  deadPageCount: number;
  zeroResultSearches: number;
  mostRead: Array<{
    filePath: string;
    title: string;
    reads: number;
    uniqueReaders: number;
  }>;
  deadPages: Array<{
    filePath: string;
    title: string;
    lastReadAt: string | null;
    updatedAt: string;
    inactiveDays: number;
  }>;
  searchesWithoutResults: Array<{
    query: string;
    count: number;
    lastSearchedAt: string;
  }>;
}

export function getContentAnalytics(
  workspaceId: string,
  days: ContentAnalyticsPeriod,
  signal?: AbortSignal,
): Promise<ContentAnalytics> {
  return apiJson<ContentAnalytics>(
    `/workspaces/${encodeURIComponent(workspaceId)}/documents/content-analytics?days=${days}`,
    { signal },
  );
}
