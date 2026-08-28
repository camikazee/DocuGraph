# Content Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn existing read and search telemetry into actionable most-read, dead-page, and search-with-no-results insights for workspace Owners and Editors.

**Architecture:** Extend the existing MongoDB `events` collection with privacy-bounded zero-result search events and add a focused `ContentAnalyticsService` inside the established documents module. A protected read-only endpoint aggregates 7/30/90-day insights, while a typed frontend adapter feeds a standalone Statistics-page component; document writes, search response shapes, and the existing statistics endpoint remain unchanged.

**Tech Stack:** NestJS 10, Mongoose aggregation, class-validator/class-transformer, Jest/Supertest, Next.js 14, React 18, TypeScript, React Testing Library.

## Global Constraints

- Keep the established Next.js frontend, NestJS documents module, MongoDB event storage, and filesystem Markdown source of truth.
- Do not add an external analytics provider, Redis, a queue, a warehouse, a charting library, or another runtime dependency.
- Reuse the existing `events` collection and existing document read telemetry.
- Record only searches that produced zero access-filtered results; normalize them to lowercase, collapse whitespace, and store at most 160 characters.
- Do not store IP addresses, user-agent strings, raw URLs, or search result contents.
- The existing `GET /workspaces/:id/documents/search` response remains an array and document search behavior remains backward-compatible.
- Content analytics is available only to Owner and Editor roles; Viewer receives 403.
- Analytics honors per-resource access rules before returning document paths or titles.
- Supported periods are exactly 7, 30, and 90 days; default is 30 days.
- A dead page is a current, visible document at least seven days old with zero reads inside the selected period.
- Deleted documents and events from other workspaces never appear in document lists or totals.
- API responses expose file paths, titles, normalized queries, counts, and ISO timestamps; they never expose MongoDB internal ids or user ids.
- Product/UI copy remains English.

---

### Task 1: Privacy-bounded analytics domain and aggregation

**Files:**
- Modify: `backend/src/documents/schemas/event.schema.ts`
- Create: `backend/src/documents/content-analytics.service.ts`
- Create: `backend/src/documents/content-analytics.service.spec.ts`
- Modify: `backend/src/documents/documents.module.ts`
- Modify: `backend/src/schema-indexes.spec.ts`

**Interfaces:**
- Produces: `ContentAnalyticsService.recordSearchWithoutResults(workspaceId, query)`.
- Produces: `ContentAnalyticsService.get(workspaceId, days, access?): Promise<ContentAnalyticsDto>`.
- Produces: `ContentAnalyticsDto` with `periodDays`, `reads`, `uniqueReaders`, `deadPageCount`, `zeroResultSearches`, `mostRead`, `deadPages`, and `searchesWithoutResults`.
- Consumes: existing `Event` and `DocumentEntity` Mongoose models plus optional `AccessChecker`.

- [ ] **Step 1: Write failing service tests for privacy normalization and aggregation**

```ts
it('records only normalized zero-result search terms', async () => {
  await service.recordSearchWithoutResults('workspace-a', '  Missing   API  ');
  expect(eventModel.create).toHaveBeenCalledWith({
    workspaceId: 'workspace-a',
    kind: 'search_zero',
    filePath: null,
    query: 'missing api',
    userId: null,
    durationMs: 0,
  });
  await service.recordSearchWithoutResults('workspace-a', 'x');
  expect(eventModel.create).toHaveBeenCalledTimes(1);
});

it('returns current visible most-read and dead pages without leaking ids', async () => {
  documentModel.find.mockReturnValue(query([
    doc('docs/hot.md', 'Hot', '2026-01-01T00:00:00.000Z'),
    doc('docs/dead.md', 'Dead', '2026-01-01T00:00:00.000Z'),
    doc('private/hidden.md', 'Hidden', '2026-01-01T00:00:00.000Z'),
  ]));
  eventModel.aggregate
    .mockResolvedValueOnce([
      { _id: 'docs/hot.md', readsInRange: 8, readerIds: ['u1', 'u2'], lastReadAt: new Date('2026-08-27T00:00:00.000Z') },
      { _id: 'private/hidden.md', readsInRange: 20, readerIds: ['u3'], lastReadAt: new Date('2026-08-27T00:00:00.000Z') },
    ])
    .mockResolvedValueOnce([{ _id: 'missing api', count: 3, lastSearchedAt: new Date('2026-08-28T00:00:00.000Z') }]);

  const result = await service.get('workspace-a', 30, (path) => path.startsWith('private/') ? 'none' : 'read');
  expect(result).toEqual(expect.objectContaining({
    periodDays: 30,
    reads: 8,
    uniqueReaders: 2,
    deadPageCount: 1,
    zeroResultSearches: 3,
    mostRead: [{ filePath: 'docs/hot.md', title: 'Hot', reads: 8, uniqueReaders: 2 }],
    deadPages: [expect.objectContaining({ filePath: 'docs/dead.md', title: 'Dead', lastReadAt: null })],
    searchesWithoutResults: [{ query: 'missing api', count: 3, lastSearchedAt: '2026-08-28T00:00:00.000Z' }],
  }));
  expect(JSON.stringify(result)).not.toContain('_id');
  expect(JSON.stringify(result)).not.toContain('private/hidden.md');
});

it('excludes new documents from dead pages and limits ranked lists to ten', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-08-28T12:00:00.000Z'));
  documentModel.find.mockReturnValue(query([
    doc('new.md', 'New', '2026-08-25T00:00:00.000Z'),
    ...Array.from({ length: 12 }, (_, index) => doc(`old-${index}.md`, `Old ${index}`, '2026-01-01T00:00:00.000Z')),
  ]));
  eventModel.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  const result = await service.get('workspace-a', 7);
  expect(result.deadPageCount).toBe(12);
  expect(result.deadPages).toHaveLength(10);
  expect(result.deadPages.map((row) => row.filePath)).not.toContain('new.md');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd backend && npm test -- content-analytics.service.spec.ts --runInBand`

Expected: FAIL because `ContentAnalyticsService` does not exist.

- [ ] **Step 3: Extend the event schema without breaking existing read rows**

Change `filePath` to `string | null` with `{ type: String, default: null }`. Add `query: string | null` with `{ type: String, default: null, maxlength: 160 }`. Keep `kind`, `userId`, and `durationMs` unchanged so existing read records remain valid. Add an aggregation index:

```ts
EventSchema.index({ workspaceId: 1, kind: 1, query: 1, createdAt: -1 });
```

Retain the current `{ workspaceId, kind, createdAt }` and `{ workspaceId, filePath }` indexes.

- [ ] **Step 4: Implement stable DTOs and query normalization**

Define these exported interfaces in `content-analytics.service.ts`:

```ts
export interface ContentAnalyticsDto {
  periodDays: 7 | 30 | 90;
  reads: number;
  uniqueReaders: number;
  deadPageCount: number;
  zeroResultSearches: number;
  mostRead: Array<{ filePath: string; title: string; reads: number; uniqueReaders: number }>;
  deadPages: Array<{ filePath: string; title: string; lastReadAt: string | null; updatedAt: string; inactiveDays: number }>;
  searchesWithoutResults: Array<{ query: string; count: number; lastSearchedAt: string }>;
}
```

Normalize searches exactly with:

```ts
const normalized = query.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 160);
if (normalized.length < 2) return;
```

Create a `search_zero` event with no user id, file path, or duration. This deliberately avoids building user-level search histories.

- [ ] **Step 5: Implement bounded Mongo aggregations and access filtering**

`get(workspaceId, days, access)` must validate `days` against `[7, 30, 90]`, calculate `cutoff = now - days`, and load current documents with `filePath title createdAt updatedAt`. Filter documents through `access(path) !== 'none'` before constructing the visible-path set.

Aggregate reads by `{ workspaceId: ObjectId, kind: 'read' }` and group by `filePath`, calculating:

```ts
{
  readsInRange: { $sum: { $cond: [{ $gte: ['$createdAt', cutoff] }, 1, 0] } },
  readerIds: { $addToSet: { $cond: [{ $and: [{ $gte: ['$createdAt', cutoff] }, { $ne: ['$userId', null] }] }, '$userId', '$$REMOVE'] } },
  lastReadAt: { $max: '$createdAt' },
}
```

Aggregate `search_zero` rows matching the cutoff, group by `query`, count, take the latest timestamp, sort by count descending then timestamp descending, and limit to 10. Build most-read from visible current documents with `readsInRange > 0`, sorted by reads descending then title, limited to 10. Build dead pages from visible documents at least seven days old with zero reads in range, calculate inactivity from `lastReadAt ?? updatedAt ?? createdAt`, sort by `inactiveDays` descending then title, expose the full count, and limit rows to 10. Compute read/reader totals only from visible current documents.

- [ ] **Step 6: Register the service and index test, then verify**

Register `ContentAnalyticsService` in `DocumentsModule.providers`. Extend `schema-indexes.spec.ts`:

```ts
it('Event has the content analytics aggregation index', () => {
  expect(hasIndex(EventSchema, { workspaceId: 1, kind: 1, query: 1, createdAt: -1 })).toBe(true);
});
```

Run: `cd backend && npm test -- content-analytics.service.spec.ts schema-indexes.spec.ts --runInBand && npm run lint && npm run build`

Expected: focused suites, lint, and build exit 0.

- [ ] **Step 7: Commit the analytics domain**

```bash
git add backend/src/documents/content-analytics.service.ts backend/src/documents/content-analytics.service.spec.ts backend/src/documents/schemas/event.schema.ts backend/src/documents/documents.module.ts backend/src/schema-indexes.spec.ts
git commit -m "feat(analytics): aggregate content insights"
```

---

### Task 2: Protected analytics endpoint and zero-result search telemetry

**Files:**
- Create: `backend/src/documents/dto/content-analytics.dto.ts`
- Modify: `backend/src/documents/documents.controller.ts`
- Create: `backend/test/content-analytics.e2e-spec.ts`
- Modify: `docs/engineering/http-contract.md`

**Interfaces:**
- Consumes: `ContentAnalyticsService` from Task 1 and the existing resource-access checker.
- Produces: `GET /api/v1/workspaces/:id/documents/content-analytics?days=7|30|90`.
- Preserves: the exact array response of `GET /api/v1/workspaces/:id/documents/search?q=...`.

- [ ] **Step 1: Write failing E2E tests for collection, roles, periods, and isolation**

```ts
it('records zero-result searches and returns actionable analytics to editors', async () => {
  await createDoc(ownerToken, workspaceId, 'guides/hot.md', '# Hot');
  await createDoc(ownerToken, workspaceId, 'guides/dead.md', '# Dead');
  await api(editorToken).post(readBase).send({ path: 'guides/hot.md', durationMs: 12000 }).expect(201);
  await api(editorToken).post(readBase).send({ path: 'guides/hot.md', durationMs: 8000 }).expect(201);
  await api(editorToken).get(`${searchBase}?q=${encodeURIComponent('Missing API')}`).expect(200, []);
  await api(editorToken).get(`${searchBase}?q=${encodeURIComponent('  missing   api ')}`).expect(200, []);

  const response = await api(editorToken).get(`${analyticsBase}?days=30`).expect(200);
  expect(response.body).toEqual(expect.objectContaining({
    periodDays: 30,
    reads: 2,
    uniqueReaders: 1,
    zeroResultSearches: 2,
    mostRead: [expect.objectContaining({ filePath: 'guides/hot.md', reads: 2 })],
    searchesWithoutResults: [expect.objectContaining({ query: 'missing api', count: 2 })],
  }));
  expect(JSON.stringify(response.body)).not.toContain('_id');
  expect(JSON.stringify(response.body)).not.toContain(editorUserId);
});

it('rejects unsupported periods and viewer access', async () => {
  await api(ownerToken).get(`${analyticsBase}?days=14`).expect(400);
  await api(viewerToken).get(`${analyticsBase}?days=30`).expect(403);
});

it('does not leak deleted, hidden, or cross-workspace document metrics', async () => {
  const otherOwner = await register('other-owner@analytics.test', 'Other Owner');
  const otherWorkspaceId = (await api(otherOwner).get('/auth/me').expect(200)).body.workspaces[0].id;
  await createDoc(otherOwner, otherWorkspaceId, 'other/private.md', '# Other');
  await api(otherOwner)
    .post(`/workspaces/${otherWorkspaceId}/documents/events/read`)
    .send({ path: 'other/private.md', durationMs: 1000 })
    .expect(201);

  await createDoc(ownerToken, workspaceId, 'hidden/secret.md', '# Secret');
  await api(ownerToken)
    .put(`/workspaces/${workspaceId}/access-rules`)
    .send({ path: 'hidden/', subjectType: 'all', level: 'none' })
    .expect(200);
  await api(ownerToken)
    .post(readBase)
    .send({ path: 'hidden/secret.md', durationMs: 1000 })
    .expect(201);

  await createDoc(ownerToken, workspaceId, 'deleted.md', '# Deleted');
  await api(ownerToken).post(readBase).send({ path: 'deleted.md', durationMs: 1000 }).expect(201);
  await api(ownerToken)
    .delete(`/workspaces/${workspaceId}/documents?path=${encodeURIComponent('deleted.md')}`)
    .expect(200);

  const response = await api(editorToken).get(`${analyticsBase}?days=90`).expect(200);
  expect(JSON.stringify(response.body)).not.toContain('other/private.md');
  expect(JSON.stringify(response.body)).not.toContain('hidden/secret.md');
  expect(JSON.stringify(response.body)).not.toContain('deleted.md');
});
```

- [ ] **Step 2: Run focused E2E and verify it fails**

Run: `cd backend && npm run test:e2e -- content-analytics.e2e-spec.ts --runInBand`

Expected: FAIL with 404 because the endpoint does not exist and searches are not recorded.

- [ ] **Step 3: Add the exact period DTO and protected endpoint**

```ts
export class ContentAnalyticsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([7, 30, 90])
  days: 7 | 30 | 90 = 30;
}
```

Inject `ContentAnalyticsService` into `DocumentsController`. Add `@Get('content-analytics')`, `@UseGuards(RolesGuard)`, and `@Roles(Role.Owner, Role.Editor)`. Call `analytics.get(workspaceId, query.days, await checker(workspaceId, req))`.

- [ ] **Step 4: Record only completed searches without visible results**

In the existing search controller method, await the current `documentsService.search(...)` call into `results`. If `results.length === 0`, await `analytics.recordSearchWithoutResults(workspaceId, q)`. Return `results` unchanged. Do not record successful searches, invalid queries, or terms shorter than two normalized characters.

- [ ] **Step 5: Document the endpoint contract**

Add the exact `ContentAnalyticsDto` shape, allowed periods, Owner/Editor authorization, dead-page definition, normalization/privacy rule, access filtering, and zero-result-only search recording to `docs/engineering/http-contract.md`. Explicitly state that the search response remains an array.

- [ ] **Step 6: Run backend verification**

Run: `cd backend && npm run test:e2e -- content-analytics.e2e-spec.ts --runInBand && npm test -- --runInBand && npm run lint && npm run build`

Expected: focused E2E, all backend unit tests, lint, and build exit 0.

- [ ] **Step 7: Commit the endpoint**

```bash
git add backend/src/documents/dto/content-analytics.dto.ts backend/src/documents/documents.controller.ts backend/test/content-analytics.e2e-spec.ts docs/engineering/http-contract.md
git commit -m "feat(analytics): expose content insights API"
```

---

### Task 3: Typed browser adapter and actionable insights component

**Files:**
- Create: `frontend/lib/api/content-analytics.ts`
- Create: `frontend/lib/api/content-analytics.test.ts`
- Create: `frontend/components/ContentInsights.tsx`
- Create: `frontend/components/ContentInsights.test.tsx`

**Interfaces:**
- Produces: `ContentAnalytics`, `ContentAnalyticsPeriod`, and `getContentAnalytics(workspaceId, days, signal?)`.
- Produces: `<ContentInsights analytics loading error onRetry />`.
- Consumes: the stable Task 2 endpoint and existing `Loader`/`Link` styling patterns.

- [ ] **Step 1: Write failing adapter tests**

```ts
it.each([7, 30, 90] as const)('requests encoded %i-day analytics', async (days) => {
  await getContentAnalytics('workspace/a', days, signal);
  expect(apiJson).toHaveBeenCalledWith(
    `/workspaces/workspace%2Fa/documents/content-analytics?days=${days}`,
    { signal },
  );
});
```

- [ ] **Step 2: Write failing component tests for all three insights**

```tsx
it('renders most-read, dead-page, and missed-search actions', () => {
  render(<ContentInsights analytics={analytics} loading={false} error={null} onRetry={jest.fn()} />);
  expect(screen.getByRole('heading', { name: 'Most read' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /API guide/ })).toHaveAttribute('href', '/documents/view?path=guides%2Fapi.md');
  expect(screen.getByRole('heading', { name: 'Dead pages' })).toBeInTheDocument();
  expect(screen.getByText('42 days inactive')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Searches without results' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /missing api/ })).toHaveAttribute('href', '/search?q=missing%20api');
});

it('shows honest empty states and a retryable isolated error', async () => {
  const user = userEvent.setup();
  const onRetry = jest.fn();
  const { rerender } = render(<ContentInsights analytics={emptyAnalytics} loading={false} error={null} onRetry={onRetry} />);
  expect(screen.getByText('No document reads in this period.')).toBeInTheDocument();
  expect(screen.getByText('Every established page received a read.')).toBeInTheDocument();
  expect(screen.getByText('No searches missed in this period.')).toBeInTheDocument();
  rerender(<ContentInsights analytics={null} loading={false} error="Could not load content insights" onRetry={onRetry} />);
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(onRetry).toHaveBeenCalled();
});
```

- [ ] **Step 3: Run frontend tests and verify they fail**

Run: `cd frontend && npm test -- lib/api/content-analytics.test.ts ContentInsights.test.tsx --runInBand`

Expected: FAIL because the adapter and component do not exist.

- [ ] **Step 4: Implement the typed adapter**

Mirror the backend DTO exactly. Define `ContentAnalyticsPeriod = 7 | 30 | 90`. Encode the workspace id and call:

```ts
return apiJson<ContentAnalytics>(
  `/workspaces/${encodeURIComponent(workspaceId)}/documents/content-analytics?days=${days}`,
  { signal },
);
```

- [ ] **Step 5: Implement a focused Content Insights component**

Render a section headed `Content insights` with four summary chips: reads, unique readers, dead pages, and missed searches. Below it render three responsive cards:

- `Most read`: up to ten document links with read and reader counts.
- `Dead pages`: up to ten document links with `<inactiveDays> days inactive` and `Last read <date>` or `Never read`.
- `Searches without results`: query links to `/search?q=...`, count, and latest date so editors can reproduce the miss and decide whether to add or rename content.

Use the existing `Loader` for isolated loading/error/retry behavior. Empty states must use the exact strings from Step 2. Do not install a graphing library or render invented trend percentages.

- [ ] **Step 6: Run focused tests and static checks**

Run: `cd frontend && npm test -- lib/api/content-analytics.test.ts ContentInsights.test.tsx --runInBand && npm run lint && npm run typecheck`

Expected: adapter/component suites, lint, and typecheck pass.

- [ ] **Step 7: Commit the browser analytics surface**

```bash
git add frontend/lib/api/content-analytics.ts frontend/lib/api/content-analytics.test.ts frontend/components/ContentInsights.tsx frontend/components/ContentInsights.test.tsx
git commit -m "feat(analytics): add content insights UI"
```

---

### Task 4: Statistics integration, documentation, and full verification

**Files:**
- Modify: `frontend/app/stats/page.tsx`
- Create: `frontend/app/stats/page.test.tsx`
- Modify: `frontend/README.md`
- Modify: `backend/README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/engineering/change-log.md`

**Interfaces:**
- Consumes: `getContentAnalytics` and `ContentInsights` from Task 3.
- Preserves: the existing `/documents/stats` request, edit chart, contributors, watchers, and range buttons.

- [ ] **Step 1: Write failing Statistics-page integration tests**

```tsx
it('loads content analytics for owners and reloads it with the selected period', async () => {
  const user = userEvent.setup();
  renderPage({ role: 'owner' });
  await screen.findByRole('heading', { name: 'Content insights' });
  expect(getContentAnalytics).toHaveBeenCalledWith('w1', 30, expect.any(AbortSignal));
  await user.click(screen.getByRole('button', { name: '7d' }));
  await waitFor(() => expect(getContentAnalytics).toHaveBeenLastCalledWith('w1', 7, expect.any(AbortSignal)));
});

it('keeps existing statistics usable when insights fail', async () => {
  jest.mocked(getContentAnalytics).mockRejectedValue(new Error('offline'));
  renderPage({ role: 'editor' });
  expect(await screen.findByText('Total reads')).toBeInTheDocument();
  expect(await screen.findByText('Could not load content insights')).toBeInTheDocument();
});

it('does not request or render content insights for viewers', async () => {
  renderPage({ role: 'viewer' });
  await screen.findByText('Total reads');
  expect(getContentAnalytics).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: 'Content insights' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the page test and verify it fails**

Run: `cd frontend && npm test -- app/stats/page.test.tsx --runInBand`

Expected: FAIL because Statistics does not load or render content insights.

- [ ] **Step 3: Integrate range-aware analytics without coupling failures**

Read the current workspace role from `profile.workspaces[0].role` and set `canViewContentAnalytics` for Owner/Editor. Keep the existing stats request unchanged. Add analytics/loading/error state and a memoized loader that calls `getContentAnalytics(ws, days, signal)` using `useLatestRequest`; abort stale period/workspace loads. Render `ContentInsights` after the existing statistics content only when authorized. An analytics failure must not set the page-level `loadError` or hide existing statistics.

- [ ] **Step 4: Update public documentation and roadmap**

Document the protected analytics endpoint, periods, privacy rules, and Statistics workflow in both package READMEs. Mark `Analytics: most-read, dead pages, search-with-no-results` complete in `ROADMAP.md`. Add a change-log entry explaining aggregation from existing Mongo events, zero-result-only normalized search collection, per-resource filtering, and the absence of third-party tracking.

- [ ] **Step 5: Run all local quality gates**

Run:

```bash
./scripts/validate-project-docs.sh
cd backend && npm run lint && npm test -- --runInBand && npm run build && npm run test:e2e -- --runInBand
cd ../frontend && npm run lint && npm run typecheck && npm test -- --runInBand && npm run build
cd .. && git diff --check
```

Expected: documentation validation, all backend/frontend tests, static checks, production builds, and whitespace validation exit 0.

- [ ] **Step 6: Commit the integrated feature**

```bash
git add frontend/app/stats/page.tsx frontend/app/stats/page.test.tsx frontend/README.md backend/README.md ROADMAP.md docs/engineering/change-log.md docs/superpowers/plans/2026-08-28-content-analytics.md
git commit -m "feat(analytics): surface actionable content insights"
```

---

## Self-Review

- Spec coverage: most-read, dead-page, and zero-result-search insights each have storage/aggregation, authorization, access filtering, typed API, UI, failure states, documentation, and tests.
- Scope control: existing read telemetry and the documents module are reused; the plan adds no external tracker, background infrastructure, chart dependency, document-write coupling, or breaking search response change.
- Privacy: search telemetry stores only normalized zero-result terms, never user ids, IPs, agents, URLs, result content, or successful searches.
- Placeholder scan: every implementation step names exact files, interfaces, behavior, commands, expected failures, and expected success criteria.
- Type consistency: backend/frontend DTOs share the same eight top-level properties and the same nested names; periods are `7 | 30 | 90` throughout.
