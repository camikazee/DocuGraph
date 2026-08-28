import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ContentAnalyticsService } from './content-analytics.service';
import { DocumentEntity } from './schemas/document.schema';
import { Event } from './schemas/event.schema';

function query<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

function countQuery(value: number) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

function doc(filePath: string, title: string, createdAt: string) {
  return {
    filePath,
    title,
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  };
}

describe('ContentAnalyticsService', () => {
  const documentModel = { find: jest.fn() };
  const eventModel = {
    create: jest.fn(),
    aggregate: jest.fn(),
    countDocuments: jest.fn(),
  };
  let service: ContentAnalyticsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-28T12:00:00.000Z'));
    eventModel.countDocuments.mockReturnValue(countQuery(0));
    const module = await Test.createTestingModule({
      providers: [
        ContentAnalyticsService,
        {
          provide: getModelToken(DocumentEntity.name),
          useValue: documentModel,
        },
        { provide: getModelToken(Event.name), useValue: eventModel },
      ],
    }).compile();
    service = module.get(ContentAnalyticsService);
  });

  afterEach(() => jest.useRealTimers());

  it('records only normalized zero-result search terms', async () => {
    await service.recordSearchWithoutResults(
      '64a000000000000000000001',
      '  Missing   API  ',
    );
    expect(eventModel.create).toHaveBeenCalledWith({
      workspaceId: '64a000000000000000000001',
      kind: 'search_zero',
      filePath: null,
      query: 'missing api',
      userId: null,
      durationMs: 0,
    });

    await service.recordSearchWithoutResults('64a000000000000000000001', 'x');
    expect(eventModel.create).toHaveBeenCalledTimes(1);
  });

  it('bounds normalized search terms to 160 characters', async () => {
    await service.recordSearchWithoutResults(
      '64a000000000000000000001',
      `  ${'A'.repeat(200)}  `,
    );

    expect(eventModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'a'.repeat(160) }),
    );
  });

  it('returns current visible most-read and dead pages without leaking ids', async () => {
    documentModel.find.mockReturnValue(
      query([
        doc('docs/hot.md', 'Hot', '2026-01-01T00:00:00.000Z'),
        doc('docs/dead.md', 'Dead', '2026-01-01T00:00:00.000Z'),
        doc('private/hidden.md', 'Hidden', '2026-01-01T00:00:00.000Z'),
      ]),
    );
    eventModel.aggregate
      .mockResolvedValueOnce([
        {
          _id: 'docs/hot.md',
          readsInRange: 8,
          readerIds: ['u1', 'u2'],
          lastReadAt: new Date('2026-08-27T00:00:00.000Z'),
        },
        {
          _id: 'private/hidden.md',
          readsInRange: 20,
          readerIds: ['u3'],
          lastReadAt: new Date('2026-08-27T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          _id: 'missing api',
          count: 3,
          lastSearchedAt: new Date('2026-08-28T00:00:00.000Z'),
        },
      ]);
    eventModel.countDocuments.mockReturnValue(countQuery(3));

    const result = await service.get('64a000000000000000000001', 30, (path) =>
      path.startsWith('private/') ? 'none' : 'read',
    );

    expect(result).toEqual(
      expect.objectContaining({
        periodDays: 30,
        reads: 8,
        uniqueReaders: 2,
        deadPageCount: 1,
        zeroResultSearches: 3,
        mostRead: [
          {
            filePath: 'docs/hot.md',
            title: 'Hot',
            reads: 8,
            uniqueReaders: 2,
          },
        ],
        deadPages: [
          expect.objectContaining({
            filePath: 'docs/dead.md',
            title: 'Dead',
            lastReadAt: null,
          }),
        ],
        searchesWithoutResults: [
          {
            query: 'missing api',
            count: 3,
            lastSearchedAt: '2026-08-28T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(JSON.stringify(result)).not.toContain('_id');
    expect(JSON.stringify(result)).not.toContain('private/hidden.md');
    expect(JSON.stringify(result)).not.toContain('u1');

    const readPipeline = eventModel.aggregate.mock.calls[0][0];
    expect(readPipeline[0].$match).toEqual({
      workspaceId: new Types.ObjectId('64a000000000000000000001'),
      kind: 'read',
    });
    const searchPipeline = eventModel.aggregate.mock.calls[1][0];
    expect(searchPipeline.at(-1)).toEqual({ $limit: 10 });
  });

  it('counts every missed search while limiting its ranked query list', async () => {
    documentModel.find.mockReturnValue(query([]));
    eventModel.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce(
      Array.from({ length: 10 }, (_, index) => ({
        _id: `query ${index}`,
        count: 2,
        lastSearchedAt: new Date('2026-08-28T00:00:00.000Z'),
      })),
    );
    eventModel.countDocuments.mockReturnValue(countQuery(42));

    const result = await service.get('64a000000000000000000001', 30);

    expect(result.searchesWithoutResults).toHaveLength(10);
    expect(result.zeroResultSearches).toBe(42);
    expect(eventModel.countDocuments).toHaveBeenCalledWith({
      workspaceId: new Types.ObjectId('64a000000000000000000001'),
      kind: 'search_zero',
      createdAt: { $gte: new Date('2026-07-29T12:00:00.000Z') },
    });
  });

  it('excludes new documents from dead pages and limits ranked lists to ten', async () => {
    documentModel.find.mockReturnValue(
      query([
        doc('new.md', 'New', '2026-08-25T00:00:00.000Z'),
        ...Array.from({ length: 12 }, (_, index) =>
          doc(`old-${index}.md`, `Old ${index}`, '2026-01-01T00:00:00.000Z'),
        ),
      ]),
    );
    eventModel.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await service.get('64a000000000000000000001', 7);

    expect(result.deadPageCount).toBe(12);
    expect(result.deadPages).toHaveLength(10);
    expect(result.deadPages.map((row) => row.filePath)).not.toContain('new.md');
  });

  it('limits most-read rows and calculates unique readers across visible documents', async () => {
    const documents = Array.from({ length: 12 }, (_, index) =>
      doc(`doc-${index}.md`, `Doc ${index}`, '2026-01-01T00:00:00.000Z'),
    );
    documentModel.find.mockReturnValue(query(documents));
    eventModel.aggregate
      .mockResolvedValueOnce(
        documents.map((document, index) => ({
          _id: document.filePath,
          readsInRange: 20 - index,
          readerIds: index === 0 ? ['shared', 'first'] : ['shared'],
          lastReadAt: new Date('2026-08-27T00:00:00.000Z'),
        })),
      )
      .mockResolvedValueOnce([]);

    const result = await service.get('64a000000000000000000001', 90);

    expect(result.mostRead).toHaveLength(10);
    expect(result.reads).toBe(174);
    expect(result.uniqueReaders).toBe(2);
  });

  it('rejects periods outside the supported privacy bounds', async () => {
    await expect(service.get('64a000000000000000000001', 14)).rejects.toThrow(
      new BadRequestException('Period must be 7, 30, or 90 days'),
    );
    expect(documentModel.find).not.toHaveBeenCalled();
    expect(eventModel.aggregate).not.toHaveBeenCalled();
  });
});
