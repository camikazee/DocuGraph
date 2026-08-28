import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessChecker } from '../access/access.service';
import {
  DocumentEntity,
  DocumentEntityDocument,
} from './schemas/document.schema';
import { Event, EventDocument } from './schemas/event.schema';

export interface ContentAnalyticsDto {
  periodDays: 7 | 30 | 90;
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

interface CurrentDocument {
  filePath: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ReadAggregate {
  _id: string;
  readsInRange: number;
  readerIds: unknown[];
  lastReadAt: Date | null;
}

interface SearchAggregate {
  _id: string;
  count: number;
  lastSearchedAt: Date;
}

const SUPPORTED_PERIODS = [7, 30, 90] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ContentAnalyticsService {
  constructor(
    @InjectModel(DocumentEntity.name)
    private readonly documentModel: Model<DocumentEntityDocument>,
    @InjectModel(Event.name)
    private readonly eventModel: Model<EventDocument>,
  ) {}

  async recordSearchWithoutResults(
    workspaceId: string,
    query: string,
  ): Promise<void> {
    const normalized = query
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .slice(0, 160);
    if (normalized.length < 2) return;

    await this.eventModel.create({
      workspaceId,
      kind: 'search_zero',
      filePath: null,
      query: normalized,
      userId: null,
      durationMs: 0,
    });
  }

  async get(
    workspaceId: string,
    days: number,
    access?: AccessChecker,
  ): Promise<ContentAnalyticsDto> {
    if (!this.isSupportedPeriod(days)) {
      throw new BadRequestException('Period must be 7, 30, or 90 days');
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const graceCutoff = new Date(now.getTime() - 7 * DAY_MS);
    const internalWorkspaceId = new Types.ObjectId(workspaceId);
    const currentDocuments = (await this.documentModel
      .find({ workspaceId: internalWorkspaceId })
      .select('filePath title createdAt updatedAt')
      .lean()
      .exec()) as unknown as CurrentDocument[];
    const visibleDocuments = currentDocuments.filter(
      (document) => !access || access(document.filePath) !== 'none',
    );
    const visiblePaths = new Set(
      visibleDocuments.map((document) => document.filePath),
    );

    const [readRows, searchRows, zeroResultSearches] = await Promise.all([
      this.aggregateReads(internalWorkspaceId, cutoff),
      this.aggregateSearches(internalWorkspaceId, cutoff),
      this.eventModel
        .countDocuments({
          workspaceId: internalWorkspaceId,
          kind: 'search_zero',
          createdAt: { $gte: cutoff },
        })
        .exec(),
    ]);
    const visibleReadRows = readRows.filter((row) => visiblePaths.has(row._id));
    const readsByPath = new Map(visibleReadRows.map((row) => [row._id, row]));
    const documentsByPath = new Map(
      visibleDocuments.map((document) => [document.filePath, document]),
    );

    const mostRead = visibleReadRows
      .filter((row) => row.readsInRange > 0)
      .map((row) => ({
        filePath: row._id,
        title: documentsByPath.get(row._id)!.title,
        reads: row.readsInRange,
        uniqueReaders: row.readerIds.length,
      }))
      .sort(
        (left, right) =>
          right.reads - left.reads || left.title.localeCompare(right.title),
      )
      .slice(0, 10);

    const allDeadPages = visibleDocuments
      .filter((document) => {
        const reads = readsByPath.get(document.filePath)?.readsInRange ?? 0;
        return document.createdAt <= graceCutoff && reads === 0;
      })
      .map((document) => {
        const lastReadAt =
          readsByPath.get(document.filePath)?.lastReadAt ?? null;
        const inactiveSince =
          lastReadAt ?? document.updatedAt ?? document.createdAt;
        return {
          filePath: document.filePath,
          title: document.title,
          lastReadAt: lastReadAt?.toISOString() ?? null,
          updatedAt: document.updatedAt.toISOString(),
          inactiveDays: Math.floor(
            (now.getTime() - inactiveSince.getTime()) / DAY_MS,
          ),
        };
      })
      .sort(
        (left, right) =>
          right.inactiveDays - left.inactiveDays ||
          left.title.localeCompare(right.title),
      );

    const readerIds = new Set(
      visibleReadRows
        .filter((row) => row.readsInRange > 0)
        .flatMap((row) => row.readerIds.map(String)),
    );
    const searchesWithoutResults = searchRows.map((row) => ({
      query: row._id,
      count: row.count,
      lastSearchedAt: row.lastSearchedAt.toISOString(),
    }));

    return {
      periodDays: days,
      reads: visibleReadRows.reduce(
        (total, row) => total + row.readsInRange,
        0,
      ),
      uniqueReaders: readerIds.size,
      deadPageCount: allDeadPages.length,
      zeroResultSearches,
      mostRead,
      deadPages: allDeadPages.slice(0, 10),
      searchesWithoutResults,
    };
  }

  private isSupportedPeriod(days: number): days is 7 | 30 | 90 {
    return (SUPPORTED_PERIODS as readonly number[]).includes(days);
  }

  private aggregateReads(
    workspaceId: Types.ObjectId,
    cutoff: Date,
  ): Promise<ReadAggregate[]> {
    return this.eventModel.aggregate<ReadAggregate>([
      { $match: { workspaceId, kind: 'read' } },
      {
        $group: {
          _id: '$filePath',
          readsInRange: {
            $sum: { $cond: [{ $gte: ['$createdAt', cutoff] }, 1, 0] },
          },
          readerIds: {
            $addToSet: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$createdAt', cutoff] },
                    { $ne: ['$userId', null] },
                  ],
                },
                '$userId',
                '$$REMOVE',
              ],
            },
          },
          lastReadAt: { $max: '$createdAt' },
        },
      },
    ]);
  }

  private aggregateSearches(
    workspaceId: Types.ObjectId,
    cutoff: Date,
  ): Promise<SearchAggregate[]> {
    return this.eventModel.aggregate<SearchAggregate>([
      {
        $match: {
          workspaceId,
          kind: 'search_zero',
          createdAt: { $gte: cutoff },
        },
      },
      {
        $group: {
          _id: '$query',
          count: { $sum: 1 },
          lastSearchedAt: { $max: '$createdAt' },
        },
      },
      { $sort: { count: -1, lastSearchedAt: -1 } },
      { $limit: 10 },
    ]);
  }
}
