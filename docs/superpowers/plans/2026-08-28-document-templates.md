# Document Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let workspace editors create a Markdown document from useful built-in templates or reusable workspace-owned templates without adding infrastructure or changing DocuGraph's Next.js/NestJS/MongoDB/filesystem architecture.

**Architecture:** A focused NestJS service exposes immutable built-in templates and tenant-scoped custom templates stored in MongoDB. The existing document create form loads the stable template DTO through a typed frontend adapter; choosing a template copies its suggested path and Markdown into the editable form, while the existing document endpoint remains the only code path that writes a document to disk and its Mongo index.

**Tech Stack:** NestJS 10, Mongoose, class-validator, Jest/Supertest, Next.js 14, React 18, TypeScript, React Testing Library.

## Global Constraints

- Keep the established Next.js frontend, NestJS REST API, MongoDB index, and filesystem Markdown source of truth.
- Do not add Redis, a queue broker, a template engine, or another runtime dependency.
- Built-in templates are immutable and available immediately after installation; custom templates are isolated by workspace.
- Only Owner and Editor roles may create, update, or delete custom templates; every workspace member may list them.
- Template application only prefills the create form; users can edit all fields before saving.
- API responses expose UUID/string template identifiers and never MongoDB internal IDs.
- Product/UI copy remains English.

---

### Task 1: Template domain, persistence, and stable DTOs

**Files:**
- Create: `backend/src/document-templates/built-in-templates.ts`
- Create: `backend/src/document-templates/schemas/document-template.schema.ts`
- Create: `backend/src/document-templates/dto/document-template.dto.ts`
- Create: `backend/src/document-templates/document-templates.service.ts`
- Create: `backend/src/document-templates/document-templates.service.spec.ts`

**Interfaces:**
- Produces: `DocumentTemplateDto` with `{ id, name, description, suggestedPath, contentRaw, builtIn }`.
- Produces: `DocumentTemplatesService.list(workspaceId)`, `create(workspaceId, input)`, `update(workspaceId, id, input)`, and `remove(workspaceId, id)`.
- Consumes: a Mongoose model whose rows are keyed by `{ workspaceId, uuid }` and uniquely named per workspace.

- [ ] **Step 1: Write failing service tests for built-ins and tenant isolation**

```ts
it('lists built-ins before workspace templates without leaking _id', async () => {
  model.find.mockReturnValue(query([{ uuid: 'custom-id', name: 'Runbook', description: '', suggestedPath: 'ops/runbook.md', contentRaw: '# Runbook' }]));
  const result = await service.list('workspace-a');
  expect(result[0]).toEqual(expect.objectContaining({ id: 'builtin:guide', builtIn: true }));
  expect(result.at(-1)).toEqual({ id: 'custom-id', name: 'Runbook', description: '', suggestedPath: 'ops/runbook.md', contentRaw: '# Runbook', builtIn: false });
  expect(result.at(-1)).not.toHaveProperty('_id');
  expect(model.find).toHaveBeenCalledWith({ workspaceId: 'workspace-a' });
});

it('updates only a custom template in the requested workspace', async () => {
  model.findOneAndUpdate.mockResolvedValue({ uuid: 'same-id' });
  await service.update('workspace-b', 'same-id', { name: 'Changed' });
  expect(model.findOneAndUpdate).toHaveBeenCalledWith(
    { workspaceId: 'workspace-b', uuid: 'same-id' },
    { $set: { name: 'Changed' } },
    { new: true },
  );
});

it('rejects mutation of a built-in template', async () => {
  await expect(service.remove('workspace-a', 'builtin:guide')).rejects.toThrow('Built-in templates are immutable');
});
```

- [ ] **Step 2: Run the service test and verify it fails**

Run: `cd backend && npm test -- document-templates.service.spec.ts --runInBand`

Expected: FAIL because the module files and `DocumentTemplatesService` do not exist.

- [ ] **Step 3: Define three dependency-free built-in templates**

```ts
import { DocumentTemplateDto } from './dto/document-template.dto';

export const BUILT_IN_TEMPLATES: readonly DocumentTemplateDto[] = [
  {
    id: 'builtin:guide',
    name: 'How-to guide',
    description: 'A task-focused guide with prerequisites and verification.',
    suggestedPath: 'guides/how-to.md',
    contentRaw: '---\ntitle: How-to guide\ntags: [guide]\nstatus: draft\n---\n\n# How-to guide\n\n## Prerequisites\n\n## Steps\n\n1. \n\n## Verify\n',
    builtIn: true,
  },
  {
    id: 'builtin:api-reference',
    name: 'API reference',
    description: 'An endpoint reference with request and response examples.',
    suggestedPath: 'api/endpoint.md',
    contentRaw: '---\ntitle: API endpoint\ntags: [api]\nstatus: draft\n---\n\n# API endpoint\n\n`GET /resource`\n\n## Request\n\n## Response\n\n```json\n{}\n```\n',
    builtIn: true,
  },
  {
    id: 'builtin:adr',
    name: 'Architecture decision',
    description: 'A concise record of context, decision, and consequences.',
    suggestedPath: 'decisions/0001-decision.md',
    contentRaw: '---\ntitle: Architecture decision\ntags: [decision]\nstatus: draft\n---\n\n# Architecture decision\n\n## Context\n\n## Decision\n\n## Consequences\n',
    builtIn: true,
  },
];
```

- [ ] **Step 4: Add validated input DTOs and the custom-template schema**

```ts
export class CreateDocumentTemplateDto {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(240) description = '';
  @IsString() @MinLength(1) @MaxLength(1024) suggestedPath: string;
  @IsString() @MinLength(1) @MaxLength(1_000_000) contentRaw: string;
}

export class UpdateDocumentTemplateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(1024) suggestedPath?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(1_000_000) contentRaw?: string;
}

export interface DocumentTemplateDto {
  id: string;
  name: string;
  description: string;
  suggestedPath: string;
  contentRaw: string;
  builtIn: boolean;
}
```

Create `DocumentTemplate` with `uuid` defaulting to `randomUUID()`, required `workspaceId`, trimmed `name`, `description`, `suggestedPath`, `contentRaw`, and timestamps. Add indexes `{ workspaceId: 1, name: 1 }` unique and `{ workspaceId: 1, createdAt: 1 }`.

- [ ] **Step 5: Implement the service with stable mapping and scoped mutations**

```ts
async list(workspaceId: string): Promise<DocumentTemplateDto[]> {
  const custom = await this.model.find({ workspaceId }).sort({ name: 1 }).lean().exec();
  return [
    ...BUILT_IN_TEMPLATES,
    ...custom.map((row) => ({
      id: row.uuid,
      name: row.name,
      description: row.description,
      suggestedPath: row.suggestedPath,
      contentRaw: row.contentRaw,
      builtIn: false,
    })),
  ];
}
```

Trim `name`, `description`, and `suggestedPath` before persistence. Convert Mongo duplicate-key `11000` to `BadRequestException('A template with that name already exists')`. Reject ids beginning with `builtin:` in `update` and `remove`; throw `NotFoundException('Document template not found')` when a workspace-scoped mutation matches no row.

- [ ] **Step 6: Run service tests and backend lint**

Run: `cd backend && npm test -- document-templates.service.spec.ts --runInBand && npm run lint`

Expected: the new suite passes and lint exits 0.

- [ ] **Step 7: Commit the domain layer**

```bash
git add backend/src/document-templates
git commit -m "feat(templates): add workspace template domain"
```

---

### Task 2: Authenticated template HTTP API

**Files:**
- Create: `backend/src/document-templates/document-templates.controller.ts`
- Create: `backend/src/document-templates/document-templates.module.ts`
- Create: `backend/test/document-templates.e2e-spec.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/schema-indexes.spec.ts`
- Modify: `docs/engineering/http-contract.md`

**Interfaces:**
- Consumes: all `DocumentTemplatesService` methods from Task 1.
- Produces: `GET/POST /api/v1/workspaces/:id/document-templates` and `PATCH/DELETE /api/v1/workspaces/:id/document-templates/:templateId`.

- [ ] **Step 1: Write the failing end-to-end authorization and isolation scenarios**

```ts
it('lists built-ins for every member and lets an editor manage custom templates', async () => {
  const builtIns = await api(viewerToken).get(base).expect(200);
  expect(builtIns.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'builtin:guide', builtIn: true })]));

  const created = await api(editorToken).post(base).send({
    name: 'Runbook', description: 'Operations checklist',
    suggestedPath: 'ops/runbook.md', contentRaw: '# Runbook',
  }).expect(201);
  expect(created.body).toEqual(expect.objectContaining({ name: 'Runbook', builtIn: false }));

  await api(editorToken).patch(`${base}/${created.body.id}`).send({ name: 'Incident runbook' }).expect(200);
  await api(editorToken).delete(`${base}/${created.body.id}`).expect(204);
});

it('blocks viewer mutations, rejects built-in deletion, and hides another workspace templates', async () => {
  await api(viewerToken).post(base).send(validTemplate).expect(403);
  await api(ownerToken).delete(`${base}/builtin:guide`).expect(400);
  const other = await api(otherOwnerToken).get(otherBase).expect(200);
  expect(other.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Private template' })]));
});
```

- [ ] **Step 2: Run the focused e2e test and verify it fails**

Run: `cd backend && npm run test:e2e -- document-templates.e2e-spec.ts --runInBand`

Expected: FAIL with 404 for the unregistered routes.

- [ ] **Step 3: Implement the guarded controller**

```ts
@Controller('workspaces/:id/document-templates')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class DocumentTemplatesController {
  constructor(private readonly templates: DocumentTemplatesService) {}

  @Get()
  list(@Param('id') workspaceId: string) { return this.templates.list(workspaceId); }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  create(@Param('id') workspaceId: string, @Body() dto: CreateDocumentTemplateDto) {
    return this.templates.create(workspaceId, dto);
  }

  @Patch(':templateId')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  update(@Param('id') workspaceId: string, @Param('templateId') id: string, @Body() dto: UpdateDocumentTemplateDto) {
    return this.templates.update(workspaceId, id, dto);
  }

  @Delete(':templateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Editor)
  async remove(@Param('id') workspaceId: string, @Param('templateId') id: string): Promise<void> {
    await this.templates.remove(workspaceId, id);
  }
}
```

- [ ] **Step 4: Register the Mongoose model, controller, service, and module**

Create `DocumentTemplatesModule` with `MongooseModule.forFeature([{ name: DocumentTemplate.name, schema: DocumentTemplateSchema }])`, import `AuthModule` and `WorkspacesModule`, and register it in `AppModule`. Extend the schema index test to assert the unique `{ workspaceId: 1, name: 1 }` index.

- [ ] **Step 5: Document the endpoint contract**

Add to `docs/engineering/http-contract.md`: template list DTO fields, workspace scoping, immutable `builtin:` ids, and the Owner/Editor mutation rule.

- [ ] **Step 6: Run focused and full backend verification**

Run: `cd backend && npm run test:e2e -- document-templates.e2e-spec.ts --runInBand && npm test -- --runInBand && npm run lint && npm run build`

Expected: all commands exit 0.

- [ ] **Step 7: Commit the HTTP API**

```bash
git add backend/src/app.module.ts backend/src/schema-indexes.spec.ts backend/src/document-templates backend/test/document-templates.e2e-spec.ts docs/engineering/http-contract.md
git commit -m "feat(templates): expose workspace template API"
```

---

### Task 3: Typed frontend adapter and accessible template picker

**Files:**
- Create: `frontend/lib/api/document-templates.ts`
- Create: `frontend/lib/api/document-templates.test.ts`
- Create: `frontend/components/DocumentTemplatePicker.tsx`
- Create: `frontend/components/DocumentTemplatePicker.test.tsx`

**Interfaces:**
- Produces: `DocumentTemplate`, `listDocumentTemplates(workspaceId, signal?)`, `createDocumentTemplate(workspaceId, input)`, `updateDocumentTemplate(workspaceId, id, input)`, and `deleteDocumentTemplate(workspaceId, id)`.
- Produces: `<DocumentTemplatePicker templates value onSelect disabled />`, where `onSelect(template)` only reports the selection and owns no document-saving behavior.

- [ ] **Step 1: Write failing adapter tests**

```ts
it('uses the workspace template collection for reads and mutations', async () => {
  jest.mocked(apiJson)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(customTemplate)
    .mockResolvedValueOnce(customTemplate);
  await listDocumentTemplates('w1');
  await createDocumentTemplate('w1', input);
  await updateDocumentTemplate('w1', 't1', { name: 'Changed' });
  await deleteDocumentTemplate('w1', 't1');
  expect(apiJson).toHaveBeenNthCalledWith(1, '/workspaces/w1/document-templates', { signal: undefined });
  expect(apiVoid).toHaveBeenCalledWith('/workspaces/w1/document-templates/t1', { method: 'DELETE' });
});
```

- [ ] **Step 2: Run the adapter test and verify it fails**

Run: `cd frontend && npm test -- document-templates.test.ts --runInBand`

Expected: FAIL because the typed adapter does not exist.

- [ ] **Step 3: Implement the typed adapter with encoded template ids**

```ts
export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  suggestedPath: string;
  contentRaw: string;
  builtIn: boolean;
}

export function listDocumentTemplates(workspaceId: string, signal?: AbortSignal) {
  return apiJson<DocumentTemplate[]>(`/workspaces/${workspaceId}/document-templates`, { signal });
}
```

Use `apiJson` for GET/POST/PATCH, `apiVoid` for DELETE, and `encodeURIComponent(id)` for item paths.

- [ ] **Step 4: Write failing picker interaction tests**

```tsx
it('groups built-in and workspace templates and emits the chosen template', async () => {
  const user = userEvent.setup();
  const onSelect = jest.fn();
  render(<DocumentTemplatePicker templates={[builtIn, custom]} value="" onSelect={onSelect} />);
  expect(screen.getByRole('group', { name: 'Built-in templates' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Workspace templates' })).toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Start from template' }), custom.id);
  expect(onSelect).toHaveBeenCalledWith(custom);
});
```

- [ ] **Step 5: Implement the native-select picker**

Render a labelled native `<select>` with a `Blank document` option, `optgroup` elements for built-in and workspace templates, and a short live description of the selected template. A native select gives keyboard and screen-reader behavior without another dialog or dependency.

- [ ] **Step 6: Run frontend focused tests, lint, and typecheck**

Run: `cd frontend && npm test -- document-templates.test.ts DocumentTemplatePicker.test.tsx --runInBand && npm run lint && npm run typecheck`

Expected: focused suites pass and both static checks exit 0.

- [ ] **Step 7: Commit the frontend boundary**

```bash
git add frontend/lib/api/document-templates.ts frontend/lib/api/document-templates.test.ts frontend/components/DocumentTemplatePicker.tsx frontend/components/DocumentTemplatePicker.test.tsx
git commit -m "feat(templates): add template picker boundary"
```

---

### Task 4: Workspace template management UI

**Files:**
- Create: `frontend/components/DocumentTemplateManager.tsx`
- Create: `frontend/components/DocumentTemplateManager.test.tsx`

**Interfaces:**
- Consumes: `createDocumentTemplate`, `updateDocumentTemplate`, and `deleteDocumentTemplate` from Task 3.
- Produces: `<DocumentTemplateManager workspaceId templates open onClose onChanged />`; `onChanged()` tells the parent to reload the canonical list after a successful mutation.
- Preserves: built-in templates are visible for context but never expose edit/delete controls.

- [ ] **Step 1: Write failing management interaction tests**

```tsx
it('creates a workspace template and asks the parent to reload', async () => {
  const user = userEvent.setup();
  const onChanged = jest.fn();
  render(<DocumentTemplateManager workspaceId="w1" templates={[builtIn]} open onClose={jest.fn()} onChanged={onChanged} />);
  await user.type(screen.getByLabelText('Template name'), 'Runbook');
  await user.type(screen.getByLabelText('Suggested path'), 'ops/runbook.md');
  await user.type(screen.getByLabelText('Template Markdown'), '# Runbook');
  await user.click(screen.getByRole('button', { name: 'Create template' }));
  expect(createDocumentTemplate).toHaveBeenCalledWith('w1', {
    name: 'Runbook', description: '', suggestedPath: 'ops/runbook.md', contentRaw: '# Runbook',
  });
  expect(onChanged).toHaveBeenCalled();
});

it('edits and deletes custom templates but not built-ins', async () => {
  const user = userEvent.setup();
  render(<DocumentTemplateManager workspaceId="w1" templates={[builtIn, custom]} open onClose={jest.fn()} onChanged={jest.fn()} />);
  expect(screen.queryByRole('button', { name: `Delete ${builtIn.name}` })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: `Edit ${custom.name}` }));
  await user.clear(screen.getByLabelText('Template name'));
  await user.type(screen.getByLabelText('Template name'), 'Incident runbook');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(updateDocumentTemplate).toHaveBeenCalledWith('w1', custom.id, expect.objectContaining({ name: 'Incident runbook' }));
  await user.click(screen.getByRole('button', { name: `Delete ${custom.name}` }));
  expect(deleteDocumentTemplate).toHaveBeenCalledWith('w1', custom.id);
});
```

- [ ] **Step 2: Run the manager test and verify it fails**

Run: `cd frontend && npm test -- DocumentTemplateManager.test.tsx --runInBand`

Expected: FAIL because the manager component does not exist.

- [ ] **Step 3: Implement the manager as an accessible modal**

Compose the existing `Modal`, `Input`, and `Button` primitives. Render a compact list split into built-in and workspace sections. Use one controlled form for create/edit with `name`, `description`, `suggestedPath`, and `contentRaw`; validate required fields locally, show adapter errors in an `aria-live="polite"` region, disable controls during a request, and reset editing state after success or close.

- [ ] **Step 4: Make deletion explicit and recover from request failures**

Require `window.confirm('Delete template "<name>"? Documents already created from it will not change.')`. On success call `onChanged`; on rejection retain the form/list and show `ApiError.message` or `Template action failed`. Never render mutation buttons next to a `builtIn: true` row.

- [ ] **Step 5: Run manager tests and frontend static checks**

Run: `cd frontend && npm test -- DocumentTemplateManager.test.tsx --runInBand && npm run lint && npm run typecheck`

Expected: the manager suite passes and both static checks exit 0.

- [ ] **Step 6: Commit the management UI**

```bash
git add frontend/components/DocumentTemplateManager.tsx frontend/components/DocumentTemplateManager.test.tsx
git commit -m "feat(templates): manage workspace templates"
```

---

### Task 5: Document-create integration and contributor documentation

**Files:**
- Modify: `frontend/app/documents/page.tsx`
- Modify: `frontend/app/documents/page.test.tsx`
- Modify: `frontend/README.md`
- Modify: `backend/README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/engineering/change-log.md`

**Interfaces:**
- Consumes: `listDocumentTemplates` and `DocumentTemplatePicker` from Task 3.
- Consumes: `DocumentTemplateManager` from Task 4.
- Preserves: document creation via `POST /workspaces/:id/documents` with `{ file_path, content_raw }`.

- [ ] **Step 1: Extend the documents-page test with template loading and prefilling**

```tsx
it('prefills an editable new-document form from a selected template', async () => {
  const user = userEvent.setup();
  mockApi([]);
  jest.mocked(listDocumentTemplates).mockResolvedValue([guideTemplate]);
  renderPage();
  await user.click((await screen.findAllByRole('button', { name: 'New document' }))[0]);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Start from template' }), guideTemplate.id);
  expect(screen.getByLabelText('File path')).toHaveValue('guides/how-to.md');
  expect(screen.getByLabelText('Markdown')).toHaveValue(expect.stringContaining('# How-to guide'));
  await user.type(screen.getByLabelText('Markdown'), '\nCustom line');
  expect(screen.getByLabelText('Markdown')).toHaveValue(expect.stringContaining('Custom line'));
});
```

- [ ] **Step 2: Run the page test and verify it fails**

Run: `cd frontend && npm test -- app/documents/page.test.tsx --runInBand`

Expected: FAIL because the page neither loads nor renders templates.

- [ ] **Step 3: Integrate loading and selection into the existing create form**

Add `templates`, `templatesLoading`, and `selectedTemplateId` state. Load templates when `ws` becomes available; an unavailable template endpoint must leave blank creation usable and must not block the document list. Render `DocumentTemplatePicker` above `File path`. On selection, set `filePath`, `content`, clear field errors, and keep both inputs editable. Reset the template id after a successful save or Cancel.

Render a `Manage templates` button beside the picker only when `canEdit`. It opens `DocumentTemplateManager`; its `onChanged` callback reloads templates and preserves the current document form values, so managing the library never discards work in progress.

- [ ] **Step 4: Verify save still uses the established document endpoint**

In the page test, submit the prefilled form and assert:

```ts
expect(apiFetch).toHaveBeenCalledWith('/workspaces/w1/documents', {
  method: 'POST',
  body: JSON.stringify({ file_path: 'guides/how-to.md', content_raw: guideTemplate.contentRaw }),
});
```

- [ ] **Step 5: Cover manager visibility and non-destructive reload**

Extend the page test to assert that Viewer does not see `Manage templates`, Owner/Editor does, and invoking the manager's `onChanged` reload path does not overwrite the currently edited file path or Markdown.

- [ ] **Step 6: Update public and engineering documentation**

Add template API/use notes to both package READMEs. In `ROADMAP.md`, replace the combined backlog line with `[x] Document templates` describing built-ins plus workspace templates, and retain unchecked lines for `Reusable snippets` and `Custom frontmatter schemas`. Add a dated entry to `docs/engineering/change-log.md` stating that templates prefill content but never bypass the filesystem-first document write path.

- [ ] **Step 7: Run all local quality gates**

Run:

```bash
./scripts/validate-project-docs.sh
cd backend && npm run lint && npm test -- --runInBand && npm run build && npm run test:e2e -- --runInBand
cd ../frontend && npm run lint && npm run typecheck && npm test -- --runInBand && npm run build
cd .. && git diff --check
```

Expected: documentation validation, backend lint/unit/build/e2e, frontend lint/typecheck/unit/build, and whitespace checks all exit 0.

- [ ] **Step 8: Commit the integrated feature**

```bash
git add frontend/app/documents/page.tsx frontend/app/documents/page.test.tsx frontend/README.md backend/README.md ROADMAP.md docs/engineering/change-log.md
git commit -m "feat(templates): create documents from templates"
```

---

## Self-Review

- Spec coverage: built-ins, tenant-scoped custom persistence, immutable built-ins, role enforcement, stable DTOs, accessible custom-template management, editable prefilling, failure fallback, documentation, and full verification each map to a task.
- Scope control: reusable snippets and custom frontmatter schemas are explicitly separate future increments; document persistence remains untouched.
- Placeholder scan: the plan contains no deferred implementation markers or unspecified error handling.
- Type consistency: backend and frontend use the same six `DocumentTemplateDto` fields; all item routes use the same `templateId` string and encode it in the browser adapter.
