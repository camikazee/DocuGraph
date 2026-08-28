# Reusable Document Snippets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let workspace editors insert built-in or reusable workspace-owned Markdown fragments at the current editor selection without changing DocuGraph's document persistence path.

**Architecture:** A focused NestJS module serves immutable built-in snippets and tenant-scoped custom snippets stored in MongoDB. Typed frontend adapters feed an accessible snippet chooser and manager; a pure insertion utility replaces the current selection, normalizes surrounding blank lines, and returns the caret position that the existing editor restores after React updates state.

**Tech Stack:** NestJS 10, Mongoose, class-validator, Jest/Supertest, Next.js 14, React 18, TypeScript, React Testing Library.

## Global Constraints

- Keep the established Next.js frontend, NestJS REST API, MongoDB index, and filesystem Markdown source of truth.
- Do not add Redis, a queue broker, a Markdown template engine, or another runtime dependency.
- Built-in snippets are immutable and available immediately after installation; custom snippets are isolated by workspace.
- Only Owner and Editor roles may create, update, or delete custom snippets; every workspace member may list them.
- Inserting a snippet only changes the browser's controlled Markdown value; saving continues through `POST /workspaces/:id/documents`.
- Replace a non-empty selection; otherwise insert at the caret. Restore focus and place the caret immediately after the inserted fragment.
- API responses expose string/UUID identifiers and never MongoDB internal IDs.
- Product/UI copy remains English.

---

### Task 1: Snippet domain, persistence, and stable DTOs

**Files:**
- Create: `backend/src/document-snippets/built-in-snippets.ts`
- Create: `backend/src/document-snippets/schemas/document-snippet.schema.ts`
- Create: `backend/src/document-snippets/dto/document-snippet.dto.ts`
- Create: `backend/src/document-snippets/document-snippets.service.ts`
- Create: `backend/src/document-snippets/document-snippets.service.spec.ts`

**Interfaces:**
- Produces: `DocumentSnippetDto` with `{ id, name, description, contentRaw, builtIn }`.
- Produces: `DocumentSnippetsService.list(workspaceId)`, `create(workspaceId, input)`, `update(workspaceId, id, input)`, and `remove(workspaceId, id)`.
- Consumes: a Mongoose model uniquely named by `{ workspaceId, name }`.

- [ ] **Step 1: Write failing service tests for stable mapping and tenant scoping**

```ts
it('lists built-ins before workspace snippets without leaking _id', async () => {
  model.find.mockReturnValue(query([{ _id: 'internal', uuid: 'custom-id', name: 'Warning', description: '', contentRaw: '> Warning' }]));
  const result = await service.list('workspace-a');
  expect(result[0]).toEqual(expect.objectContaining({ id: 'builtin:code-block', builtIn: true }));
  expect(result.at(-1)).toEqual({ id: 'custom-id', name: 'Warning', description: '', contentRaw: '> Warning', builtIn: false });
  expect(result.at(-1)).not.toHaveProperty('_id');
  expect(model.find).toHaveBeenCalledWith({ workspaceId: 'workspace-a' });
});

it('scopes update by workspace and maps duplicate names safely', async () => {
  model.findOneAndUpdate.mockResolvedValue({ uuid: 'same-id', name: 'Changed', description: '', contentRaw: '> Changed' });
  await service.update('workspace-b', 'same-id', { name: ' Changed ' });
  expect(model.findOneAndUpdate).toHaveBeenCalledWith(
    { workspaceId: 'workspace-b', uuid: 'same-id' },
    { $set: { name: 'Changed' } },
    { new: true },
  );
  model.create.mockRejectedValue({ code: 11000 });
  await expect(service.create('workspace-b', validInput)).rejects.toThrow('A snippet with that name already exists');
});

it('rejects mutation of a built-in snippet', async () => {
  await expect(service.remove('workspace-a', 'builtin:checklist')).rejects.toThrow('Built-in snippets are immutable');
});
```

- [ ] **Step 2: Run the service test and verify it fails**

Run: `cd backend && npm test -- document-snippets.service.spec.ts --runInBand`

Expected: FAIL because the snippet service and schema do not exist.

- [ ] **Step 3: Define three dependency-free built-in snippets**

```ts
export const BUILT_IN_SNIPPETS: readonly DocumentSnippetDto[] = [
  {
    id: 'builtin:code-block',
    name: 'Code example',
    description: 'A fenced TypeScript example.',
    contentRaw: '```ts\nconst value = true;\n```',
    builtIn: true,
  },
  {
    id: 'builtin:checklist',
    name: 'Checklist',
    description: 'A three-item task checklist.',
    contentRaw: '- [ ] First item\n- [ ] Second item\n- [ ] Third item',
    builtIn: true,
  },
  {
    id: 'builtin:mermaid',
    name: 'Mermaid flowchart',
    description: 'A small flowchart rendered by DocuGraph.',
    contentRaw: '```mermaid\nflowchart LR\n  Start --> Finish\n```',
    builtIn: true,
  },
];
```

- [ ] **Step 4: Add validated DTOs and the custom-snippet schema**

Create `CreateDocumentSnippetDto` with required trimmed `name` (1–80), optional `description` (max 240), and required `contentRaw` (1–1000000). Create `UpdateDocumentSnippetDto` with the same optional fields. Define `DocumentSnippetDto` exactly as `{ id, name, description, contentRaw, builtIn }`.

Create `DocumentSnippet` with `uuid` defaulting to `randomUUID()`, required `workspaceId`, trimmed `name`, `description`, `contentRaw`, and timestamps. Add unique index `{ workspaceId: 1, name: 1 }` and sorting index `{ workspaceId: 1, createdAt: 1 }`.

- [ ] **Step 5: Implement scoped CRUD and stable mapping**

```ts
async list(workspaceId: string): Promise<DocumentSnippetDto[]> {
  const custom = await this.model.find({ workspaceId }).sort({ name: 1 }).lean().exec();
  return [...BUILT_IN_SNIPPETS, ...custom.map((row) => this.toDto(row))];
}

private toDto(row: SnippetRow): DocumentSnippetDto {
  return { id: row.uuid, name: row.name, description: row.description, contentRaw: row.contentRaw, builtIn: false };
}
```

Trim `name` and `description` but preserve `contentRaw` byte-for-byte. Reject empty PATCH bodies, translate duplicate-key `11000` to `BadRequestException('A snippet with that name already exists')`, reject `builtin:` mutation, and return `NotFoundException('Document snippet not found')` when a workspace-scoped mutation matches no row.

- [ ] **Step 6: Run focused tests and backend lint**

Run: `cd backend && npm test -- document-snippets.service.spec.ts --runInBand && npm run lint`

Expected: the new suite passes and lint exits 0.

- [ ] **Step 7: Commit the snippet domain**

```bash
git add backend/src/document-snippets
git commit -m "feat(snippets): add workspace snippet domain"
```

---

### Task 2: Authenticated snippet HTTP API

**Files:**
- Create: `backend/src/document-snippets/document-snippets.controller.ts`
- Create: `backend/src/document-snippets/document-snippets.module.ts`
- Create: `backend/test/document-snippets.e2e-spec.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/schema-indexes.spec.ts`
- Modify: `docs/engineering/http-contract.md`

**Interfaces:**
- Consumes: `DocumentSnippetsService` from Task 1.
- Produces: `GET/POST /api/v1/workspaces/:id/document-snippets` and `PATCH/DELETE /api/v1/workspaces/:id/document-snippets/:snippetId`.

- [ ] **Step 1: Write failing E2E scenarios for roles and isolation**

```ts
it('lists built-ins for viewers and lets editors manage custom snippets', async () => {
  const list = await api(viewerToken).get(base).expect(200);
  expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'builtin:checklist', builtIn: true })]));
  const created = await api(editorToken).post(base).send(validSnippet).expect(201);
  await api(editorToken).patch(`${base}/${created.body.id}`).send({ name: 'Changed' }).expect(200);
  await api(editorToken).delete(`${base}/${created.body.id}`).expect(204);
});

it('blocks viewer mutation, built-in deletion, and cross-workspace reads', async () => {
  await api(viewerToken).post(base).send(validSnippet).expect(403);
  await api(ownerToken).delete(`${base}/${encodeURIComponent('builtin:checklist')}`).expect(400);
  const other = await api(otherOwnerToken).get(otherBase).expect(200);
  expect(other.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Private snippet' })]));
});
```

- [ ] **Step 2: Run the focused E2E test and verify it fails**

Run: `cd backend && npm run test:e2e -- document-snippets.e2e-spec.ts --runInBand`

Expected: FAIL with 404 for the unregistered routes.

- [ ] **Step 3: Implement guarded routes**

Use `@Controller('workspaces/:id/document-snippets')` with `JwtAuthGuard` and `WorkspaceGuard`. `GET` calls `list`; protect `POST`, `PATCH(':snippetId')`, and `DELETE(':snippetId')` with `RolesGuard` plus `@Roles(Role.Owner, Role.Editor)`. Return 204 from DELETE.

- [ ] **Step 4: Register model/module and verify its index**

Create `DocumentSnippetsModule` importing `MongooseModule.forFeature`, `AuthModule`, and `WorkspacesModule`; register it in `AppModule`. Extend `schema-indexes.spec.ts` to require unique `{ workspaceId: 1, name: 1 }` on `DocumentSnippetSchema`.

- [ ] **Step 5: Document the endpoint contract**

Add the five stable DTO fields, immutable `builtin:` rule, tenant scoping, and Owner/Editor mutation authorization to `docs/engineering/http-contract.md`.

- [ ] **Step 6: Run API verification**

Run: `cd backend && npm run test:e2e -- document-snippets.e2e-spec.ts --runInBand && npm test -- --runInBand && npm run lint && npm run build`

Expected: focused E2E, full unit tests, lint, and build all exit 0.

- [ ] **Step 7: Commit the API**

```bash
git add backend/src/app.module.ts backend/src/schema-indexes.spec.ts backend/src/document-snippets backend/test/document-snippets.e2e-spec.ts docs/engineering/http-contract.md
git commit -m "feat(snippets): expose workspace snippet API"
```

---

### Task 3: Typed browser adapter and selection-safe insertion utility

**Files:**
- Create: `frontend/lib/api/document-snippets.ts`
- Create: `frontend/lib/api/document-snippets.test.ts`
- Create: `frontend/lib/insertMarkdownSnippet.ts`
- Create: `frontend/lib/insertMarkdownSnippet.test.ts`

**Interfaces:**
- Produces: `DocumentSnippet`, `listDocumentSnippets`, `createDocumentSnippet`, `updateDocumentSnippet`, and `deleteDocumentSnippet`.
- Produces: `insertMarkdownSnippet(value, snippet, selectionStart, selectionEnd): { value: string; caret: number }`.

- [ ] **Step 1: Write failing adapter and insertion tests**

```ts
it('uses encoded workspace snippet routes', async () => {
  await listDocumentSnippets('w1');
  await createDocumentSnippet('w1', input);
  await updateDocumentSnippet('w1', 'custom/id', { name: 'Changed' });
  await deleteDocumentSnippet('w1', 'custom/id');
  expect(apiVoid).toHaveBeenCalledWith('/workspaces/w1/document-snippets/custom%2Fid', { method: 'DELETE' });
});

it('inserts at a caret with clean blank-line boundaries', () => {
  expect(insertMarkdownSnippet('# Title\nBody', '- [ ] Item', 8, 8)).toEqual({
    value: '# Title\n\n- [ ] Item\n\nBody',
    caret: 19,
  });
});

it('replaces the selected range and preserves surrounding text', () => {
  expect(insertMarkdownSnippet('Before OLD After', '**new**', 7, 10)).toEqual({
    value: 'Before \n\n**new**\n\n After',
    caret: 16,
  });
});

it('clamps invalid browser selection offsets', () => {
  expect(insertMarkdownSnippet('abc', 'x', -5, 99)).toEqual({ value: 'x', caret: 1 });
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `cd frontend && npm test -- document-snippets.test.ts insertMarkdownSnippet.test.ts --runInBand`

Expected: FAIL because adapter and utility do not exist.

- [ ] **Step 3: Implement the adapter through shared API primitives**

Mirror the stable DTO as `{ id, name, description, contentRaw, builtIn }`. Use `apiJson` for GET/POST/PATCH, `apiVoid` for DELETE, and `encodeURIComponent(id)` for item paths. Do not construct headers or call `fetch` in feature code.

- [ ] **Step 4: Implement deterministic insertion**

```ts
export function insertMarkdownSnippet(value: string, snippet: string, start: number, end: number) {
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  const before = value.slice(0, from);
  const after = value.slice(to);
  const prefix = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
  const suffix = after && !after.startsWith('\n\n') ? (after.startsWith('\n') ? '\n' : '\n\n') : '';
  const inserted = prefix + snippet + suffix;
  return { value: before + inserted + after, caret: before.length + prefix.length + snippet.length };
}
```

- [ ] **Step 5: Run focused tests, lint, and typecheck**

Run: `cd frontend && npm test -- document-snippets.test.ts insertMarkdownSnippet.test.ts --runInBand && npm run lint && npm run typecheck`

Expected: both suites and static checks pass.

- [ ] **Step 6: Commit frontend boundaries**

```bash
git add frontend/lib/api/document-snippets.ts frontend/lib/api/document-snippets.test.ts frontend/lib/insertMarkdownSnippet.ts frontend/lib/insertMarkdownSnippet.test.ts
git commit -m "feat(snippets): add browser snippet boundaries"
```

---

### Task 4: Accessible chooser and workspace snippet manager

**Files:**
- Create: `frontend/components/DocumentSnippetPicker.tsx`
- Create: `frontend/components/DocumentSnippetPicker.test.tsx`
- Create: `frontend/components/DocumentSnippetManager.tsx`
- Create: `frontend/components/DocumentSnippetManager.test.tsx`

**Interfaces:**
- Produces: `<DocumentSnippetPicker snippets open onClose onInsert onManage canManage />`.
- Produces: `<DocumentSnippetManager workspaceId snippets open onClose onChanged />`.
- Consumes: snippet DTO and mutation adapters from Task 3; existing `Modal`, `Input`, and `Button` primitives.

- [ ] **Step 1: Write failing chooser tests**

```tsx
it('filters snippets and emits the chosen built-in', async () => {
  const user = userEvent.setup();
  const onInsert = jest.fn();
  render(<DocumentSnippetPicker snippets={[checklist, mermaid]} open onClose={jest.fn()} onInsert={onInsert} onManage={jest.fn()} canManage />);
  await user.type(screen.getByRole('searchbox', { name: 'Filter snippets' }), 'check');
  expect(screen.getByRole('button', { name: 'Insert Checklist' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Insert Mermaid flowchart' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Insert Checklist' }));
  expect(onInsert).toHaveBeenCalledWith(checklist);
});

it('hides management from viewers', () => {
  render(<DocumentSnippetPicker snippets={[]} open onClose={jest.fn()} onInsert={jest.fn()} onManage={jest.fn()} canManage={false} />);
  expect(screen.queryByRole('button', { name: 'Manage snippets' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Write failing manager CRUD and failure tests**

Test create with `name`, `description`, and `Snippet Markdown`; test edit/delete controls only on `builtIn: false`; require confirmation text `Delete snippet "<name>"? Documents using it will not change.`; assert `ApiError.message` appears in an `aria-live` region and failed form values remain.

- [ ] **Step 3: Run component tests and verify they fail**

Run: `cd frontend && npm test -- DocumentSnippetPicker.test.tsx DocumentSnippetManager.test.tsx --runInBand`

Expected: FAIL because both components do not exist.

- [ ] **Step 4: Implement the searchable chooser**

Compose `Modal` with a labelled `type="search"` input, built-in/workspace sections, empty-filter message, and one native button per result named `Insert <name>`. Show `Manage snippets` only when `canManage`; call `onManage` without mutating editor content.

- [ ] **Step 5: Implement the custom snippet manager**

Compose `Modal`, `Input`, and `Button`. Use one controlled create/edit form with `name`, `description`, and `contentRaw`; preserve exact Markdown, validate required name/content, disable actions while awaiting requests, show safe errors, reset after success, and call `onChanged` to reload canonical data. Built-ins are read-only context rows.

- [ ] **Step 6: Run component tests and static checks**

Run: `cd frontend && npm test -- DocumentSnippetPicker.test.tsx DocumentSnippetManager.test.tsx --runInBand && npm run lint && npm run typecheck`

Expected: component suites, lint, and typecheck pass.

- [ ] **Step 7: Commit snippet UI components**

```bash
git add frontend/components/DocumentSnippetPicker.tsx frontend/components/DocumentSnippetPicker.test.tsx frontend/components/DocumentSnippetManager.tsx frontend/components/DocumentSnippetManager.test.tsx
git commit -m "feat(snippets): add snippet library UI"
```

---

### Task 5: Editor integration, documentation, and full verification

**Files:**
- Modify: `frontend/app/documents/edit/page.tsx`
- Create: `frontend/app/documents/edit/page.test.tsx`
- Modify: `frontend/README.md`
- Modify: `backend/README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/engineering/change-log.md`

**Interfaces:**
- Consumes: `listDocumentSnippets`, chooser, manager, and `insertMarkdownSnippet` from Tasks 3–4.
- Preserves: `taRef`, `caretRef`, link autocomplete, preview, and the existing filesystem-first save request.

- [ ] **Step 1: Write failing editor integration tests**

```tsx
it('replaces the current selection with a snippet and restores the caret', async () => {
  const user = userEvent.setup();
  jest.mocked(listDocumentSnippets).mockResolvedValue([checklist]);
  renderPage();
  const editor = await screen.findByRole('textbox', { name: 'Markdown editor' });
  fireEvent.change(editor, { target: { value: 'Before OLD After' } });
  editor.setSelectionRange(7, 10);
  await user.click(screen.getByRole('button', { name: 'Snippets' }));
  await user.click(screen.getByRole('button', { name: 'Insert Checklist' }));
  expect(editor).toHaveValue('Before \n\n- [ ] Item\n\n After');
  await waitFor(() => expect(editor.selectionStart).toBe(19));
  expect(editor).toHaveFocus();
});

it('keeps editing usable when snippet loading fails', async () => {
  jest.mocked(listDocumentSnippets).mockRejectedValue(new Error('offline'));
  renderPage();
  expect(await screen.findByRole('textbox', { name: 'Markdown editor' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Snippets' })).toBeEnabled();
});
```

- [ ] **Step 2: Run the editor test and verify it fails**

Run: `cd frontend && npm test -- app/documents/edit/page.test.tsx --runInBand`

Expected: FAIL because editor snippet controls do not exist.

- [ ] **Step 3: Integrate loading and insertion without disturbing autocomplete**

Add `snippets`, `snippetPickerOpen`, and `snippetManagerOpen` state. Load snippets when `ws` changes; on failure use an empty list and keep editing enabled. Add `aria-label="Markdown editor"` to the existing textarea and a toolbar `Snippets` button for Owner/Editor. When opening, capture `taRef.current.selectionStart/selectionEnd`. On insertion call the pure utility, store its returned caret in `caretRef`, update content, close the chooser, clear autocomplete, and switch from preview-only to split mode.

- [ ] **Step 4: Integrate management without losing document state**

Picker `onManage` closes the chooser and opens `DocumentSnippetManager`. Manager `onChanged` reloads snippets without changing `content`, `filePath`, selection refs, or `commitMsg`. Closing the manager returns focus to the toolbar through the existing modal focus restoration.

- [ ] **Step 5: Update public documentation and roadmap**

Document snippet endpoints and the editor workflow in both package READMEs. Mark `Reusable snippets` complete in `ROADMAP.md`, leaving `Custom frontmatter schemas` unchecked. Add an engineering change-log entry stating that snippet insertion is browser-only until the normal document save and that built-ins require no setup.

- [ ] **Step 6: Run all local quality gates**

Run:

```bash
./scripts/validate-project-docs.sh
cd backend && npm run lint && npm test -- --runInBand && npm run build && npm run test:e2e -- --runInBand
cd ../frontend && npm run lint && npm run typecheck && npm test -- --runInBand && npm run build
cd .. && git diff --check
```

Expected: documentation validation, all backend and frontend tests/static checks/builds, and whitespace validation exit 0.

- [ ] **Step 7: Commit the integrated feature**

```bash
git add frontend/app/documents/edit/page.tsx frontend/app/documents/edit/page.test.tsx frontend/README.md backend/README.md ROADMAP.md docs/engineering/change-log.md docs/superpowers/plans/2026-08-28-document-snippets.md
git commit -m "feat(snippets): insert reusable Markdown snippets"
```

---

## Self-Review

- Spec coverage: dependency-free built-ins, custom tenant storage, role enforcement, stable DTOs, selection replacement, caret restoration, accessible chooser/manager, failure fallback, documentation, and full verification each map to a task.
- Scope control: custom frontmatter schemas remain a separate future increment; document persistence and Markdown rendering remain unchanged.
- Placeholder scan: every behavior and failure path has an exact test, implementation rule, or command.
- Type consistency: backend and frontend share the five snippet DTO fields; all item routes use `snippetId`, and editor insertion consumes `contentRaw` unchanged.
