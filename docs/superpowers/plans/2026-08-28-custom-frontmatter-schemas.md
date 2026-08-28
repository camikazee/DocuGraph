# Custom Frontmatter Schemas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let workspace editors define reusable frontmatter field schemas and safely apply them to Markdown documents through a friendly form without replacing unknown YAML or changing the existing document persistence pipeline.

**Architecture:** A focused NestJS module exposes one immutable built-in schema plus tenant-scoped custom schemas stored in MongoDB. The browser uses a dependency-free frontmatter utility to read and update supported top-level YAML fields while preserving the Markdown body and unmanaged frontmatter lines; the existing editor remains the only place that applies the result, and the existing document endpoint remains the only persistence path.

**Tech Stack:** NestJS 10, Mongoose, class-validator/class-transformer, Jest/Supertest, Next.js 14, React 18, TypeScript, React Testing Library.

## Global Constraints

- Keep the established Next.js frontend, NestJS REST API, MongoDB index, and filesystem Markdown source of truth.
- Do not copy Symfony architecture or introduce JSON Schema, a YAML package in the frontend, a form-builder dependency, Redis, or another runtime service.
- Provide one immutable built-in schema immediately after installation; custom schemas are isolated by workspace.
- Only Owner and Editor roles may create, update, or delete custom schemas; every workspace member may list them.
- Supported field types are exactly `text`, `number`, `boolean`, `date`, `select`, and `list`.
- A schema contains at most 24 fields; a `select` field contains 1–50 unique, non-empty options.
- Field keys match `^[A-Za-z][A-Za-z0-9_-]{0,63}$`; reject duplicate keys and the reserved keys `__proto__`, `constructor`, and `prototype`.
- Applying a schema is an editor helper, not a server-side document-write gate. Git sync, ZIP import, API/CI writes, and existing documents remain backward-compatible.
- Applying a schema preserves the Markdown body and all frontmatter keys not managed by the selected schema.
- Required-field validation happens before applying the browser-side edit. Saving still uses `POST /workspaces/:id/documents`.
- API responses expose UUID/string identifiers and never MongoDB internal IDs.
- Product/UI copy remains English.

---

### Task 1: Frontmatter schema domain and stable DTOs

**Files:**
- Create: `backend/src/frontmatter-schemas/built-in-frontmatter-schemas.ts`
- Create: `backend/src/frontmatter-schemas/schemas/frontmatter-schema.schema.ts`
- Create: `backend/src/frontmatter-schemas/dto/frontmatter-schema.dto.ts`
- Create: `backend/src/frontmatter-schemas/frontmatter-schemas.service.ts`
- Create: `backend/src/frontmatter-schemas/frontmatter-schemas.service.spec.ts`

**Interfaces:**
- Produces: `FrontmatterFieldType`, `FrontmatterFieldDto`, `FrontmatterSchemaDto`, `CreateFrontmatterSchemaDto`, and `UpdateFrontmatterSchemaDto`.
- Produces: `FrontmatterSchemasService.list(workspaceId)`, `create(workspaceId, input)`, `update(workspaceId, id, input)`, and `remove(workspaceId, id)`.
- Persists: custom schema rows uniquely named by `{ workspaceId, name }`; field definitions remain ordered arrays.

- [ ] **Step 1: Write failing domain tests for mapping, normalization, and tenant scoping**

```ts
it('lists the built-in schema before tenant-scoped custom schemas', async () => {
  model.find.mockReturnValue(query([{ _id: 'internal', uuid: 'schema-1', name: 'Release', description: '', fields: validFields }]));
  const result = await service.list('workspace-a');
  expect(result[0]).toEqual(expect.objectContaining({ id: 'builtin:basic', builtIn: true }));
  expect(result.at(-1)).toEqual({ id: 'schema-1', name: 'Release', description: '', fields: validFields, builtIn: false });
  expect(result.at(-1)).not.toHaveProperty('_id');
  expect(model.find).toHaveBeenCalledWith({ workspaceId: 'workspace-a' });
});

it('trims schema text while preserving field order', async () => {
  model.create.mockImplementation(async (value) => ({ uuid: 'schema-1', ...value }));
  const result = await service.create('workspace-a', {
    name: ' Release ',
    description: ' Deployment metadata ',
    fields: [{ key: 'owner', label: ' Owner ', type: 'text', required: true, options: [], defaultValue: '' }],
  });
  expect(model.create).toHaveBeenCalledWith(expect.objectContaining({
    workspaceId: 'workspace-a',
    name: 'Release',
    description: 'Deployment metadata',
    fields: [{ key: 'owner', label: 'Owner', type: 'text', required: true, options: [], defaultValue: '' }],
  }));
  expect(result.fields[0].key).toBe('owner');
});

it.each([
  [[field('owner'), field('owner')], 'Field keys must be unique'],
  [[field('__proto__')], 'Field key "__proto__" is reserved'],
  [[field('stage', 'select', [])], 'Select fields require at least one option'],
])('rejects invalid field collections', async (fields, message) => {
  await expect(service.create('workspace-a', { name: 'Invalid', description: '', fields })).rejects.toThrow(message);
});

it('rejects built-in mutation and scopes custom mutation by workspace', async () => {
  await expect(service.remove('workspace-a', 'builtin:basic')).rejects.toThrow('Built-in frontmatter schemas are immutable');
  model.findOneAndUpdate.mockResolvedValue(null);
  await expect(service.update('workspace-b', 'schema-1', { name: 'Changed' })).rejects.toThrow('Frontmatter schema not found');
  expect(model.findOneAndUpdate).toHaveBeenCalledWith(
    { workspaceId: 'workspace-b', uuid: 'schema-1' },
    { $set: { name: 'Changed' } },
    { new: true },
  );
});
```

- [ ] **Step 2: Run the service test and verify it fails**

Run: `cd backend && npm test -- frontmatter-schemas.service.spec.ts --runInBand`

Expected: FAIL because the module files do not exist.

- [ ] **Step 3: Define the immutable built-in schema**

```ts
export const BUILT_IN_FRONTMATTER_SCHEMAS: readonly FrontmatterSchemaDto[] = [
  {
    id: 'builtin:basic',
    name: 'Basic document',
    description: 'Title, tags, lifecycle status, and version.',
    builtIn: true,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: false, options: [], defaultValue: '' },
      { key: 'tags', label: 'Tags', type: 'list', required: false, options: [], defaultValue: '' },
      { key: 'status', label: 'Status', type: 'select', required: false, options: ['draft', 'review', 'published', 'archived'], defaultValue: 'draft' },
      { key: 'version', label: 'Version', type: 'text', required: false, options: [], defaultValue: '' },
    ],
  },
];
```

- [ ] **Step 4: Add nested validated DTOs and the persistence schema**

Use `@Type(() => FrontmatterFieldInputDto)` with `@ValidateNested({ each: true })`, `@ArrayMinSize(1)`, and `@ArrayMaxSize(24)`. Define the public types exactly as:

```ts
export const FRONTMATTER_FIELD_TYPES = ['text', 'number', 'boolean', 'date', 'select', 'list'] as const;
export type FrontmatterFieldType = (typeof FRONTMATTER_FIELD_TYPES)[number];

export interface FrontmatterFieldDto {
  key: string;
  label: string;
  type: FrontmatterFieldType;
  required: boolean;
  options: string[];
  defaultValue: string;
}

export interface FrontmatterSchemaDto {
  id: string;
  name: string;
  description: string;
  fields: FrontmatterFieldDto[];
  builtIn: boolean;
}
```

`FrontmatterFieldInputDto` requires `key` length 1–64 matching `^[A-Za-z][A-Za-z0-9_-]{0,63}$`, `label` length 1–80, a valid `type`, boolean `required`, `options` with at most 50 strings of length 1–120, and `defaultValue` with maximum length 500. `CreateFrontmatterSchemaDto` requires `name` length 1–80, optional `description` maximum 240, and 1–24 nested fields. `UpdateFrontmatterSchemaDto` makes those three properties optional.

Persist `uuid`, `workspaceId`, `name`, `description`, and ordered embedded `fields`. Add indexes `{ workspaceId: 1, name: 1 }` unique and `{ workspaceId: 1, createdAt: 1 }`.

- [ ] **Step 5: Implement normalized, tenant-scoped CRUD**

Implement `normalizeFields(fields)` so it:

```ts
const normalized = fields.map((field) => ({
  key: field.key.trim(),
  label: field.label.trim(),
  type: field.type,
  required: field.required,
  options: field.options.map((option) => option.trim()),
  defaultValue: field.defaultValue,
}));
```

Then reject duplicate/reserved keys, duplicate or empty options, missing select options, options on non-select fields, non-numeric number defaults, boolean defaults other than `''`, `true`, or `false`, and select defaults outside `options`. Preserve `defaultValue` exactly for text/date/list. Reject empty PATCH bodies, reject `builtin:` mutation, map duplicate-key `11000` to `BadRequestException('A frontmatter schema with that name already exists')`, and map missing scoped mutations to `NotFoundException('Frontmatter schema not found')`.

- [ ] **Step 6: Run focused tests and backend lint**

Run: `cd backend && npm test -- frontmatter-schemas.service.spec.ts --runInBand && npm run lint`

Expected: all new domain tests pass and lint exits 0.

- [ ] **Step 7: Commit the domain**

```bash
git add backend/src/frontmatter-schemas
git commit -m "feat(frontmatter): add workspace schema domain"
```

---

### Task 2: Authenticated frontmatter schema HTTP API

**Files:**
- Create: `backend/src/frontmatter-schemas/frontmatter-schemas.controller.ts`
- Create: `backend/src/frontmatter-schemas/frontmatter-schemas.module.ts`
- Create: `backend/test/frontmatter-schemas.e2e-spec.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/schema-indexes.spec.ts`
- Modify: `docs/engineering/http-contract.md`

**Interfaces:**
- Consumes: `FrontmatterSchemasService` from Task 1.
- Produces: `GET/POST /api/v1/workspaces/:id/frontmatter-schemas` and `PATCH/DELETE /api/v1/workspaces/:id/frontmatter-schemas/:schemaId`.

- [ ] **Step 1: Write failing E2E tests for roles, stable DTOs, and isolation**

```ts
it('lists the built-in schema for viewers and lets editors manage custom schemas', async () => {
  const list = await api(viewerToken).get(base).expect(200);
  expect(list.body).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'builtin:basic', name: 'Basic document', builtIn: true }),
  ]));
  const created = await api(editorToken).post(base).send(validSchema).expect(201);
  expect(created.body).toEqual(expect.objectContaining({ id: expect.any(String), builtIn: false, fields: validSchema.fields }));
  expect(created.body).not.toHaveProperty('_id');
  await api(editorToken).patch(`${base}/${created.body.id}`).send({ name: 'Release metadata' }).expect(200);
  await api(editorToken).delete(`${base}/${created.body.id}`).expect(204);
});

it('blocks viewer mutation, built-in deletion, and cross-workspace leakage', async () => {
  await api(viewerToken).post(base).send(validSchema).expect(403);
  await api(ownerToken).delete(`${base}/${encodeURIComponent('builtin:basic')}`).expect(400);
  await api(ownerToken).post(base).send({ ...validSchema, name: 'Private schema' }).expect(201);
  const other = await api(otherOwnerToken).get(otherBase).expect(200);
  expect(other.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Private schema' })]));
});

it('rejects duplicate keys and invalid select defaults through the public API', async () => {
  await api(editorToken).post(base).send({ ...validSchema, fields: [validSchema.fields[0], validSchema.fields[0]] }).expect(400);
  await api(editorToken).post(base).send({ ...validSchema, fields: [{ key: 'stage', label: 'Stage', type: 'select', required: true, options: ['draft'], defaultValue: 'live' }] }).expect(400);
});
```

- [ ] **Step 2: Run the focused E2E test and verify it fails**

Run: `cd backend && npm run test:e2e -- frontmatter-schemas.e2e-spec.ts --runInBand`

Expected: FAIL with 404 because the routes are not registered.

- [ ] **Step 3: Implement guarded CRUD routes**

Create `@Controller('workspaces/:id/frontmatter-schemas')` guarded by `JwtAuthGuard` and `WorkspaceGuard`. `GET` calls `list`. Protect `POST`, `PATCH(':schemaId')`, and `DELETE(':schemaId')` with `RolesGuard` and `@Roles(Role.Owner, Role.Editor)`. Return HTTP 204 from DELETE.

- [ ] **Step 4: Register the model/module and verify indexes**

Create `FrontmatterSchemasModule` importing the Mongoose model, `AuthModule`, and `WorkspacesModule`; register it in `AppModule`. Extend `schema-indexes.spec.ts` with:

```ts
it('FrontmatterSchema has a unique workspace name', () => {
  expect(hasIndex(FrontmatterSchemaSchema, { workspaceId: 1, name: 1 }, { unique: true })).toBe(true);
});
```

- [ ] **Step 5: Document the HTTP contract**

Add the exact public schema/field shapes, supported field types, `builtin:` immutability, workspace scoping, and Owner/Editor mutation rules to `docs/engineering/http-contract.md`. State explicitly that the API stores editor schema definitions and does not intercept document writes.

- [ ] **Step 6: Run API verification**

Run: `cd backend && npm run test:e2e -- frontmatter-schemas.e2e-spec.ts --runInBand && npm test -- --runInBand && npm run lint && npm run build`

Expected: focused E2E, full unit tests, lint, and build all exit 0.

- [ ] **Step 7: Commit the API**

```bash
git add backend/src/app.module.ts backend/src/schema-indexes.spec.ts backend/src/frontmatter-schemas backend/test/frontmatter-schemas.e2e-spec.ts docs/engineering/http-contract.md
git commit -m "feat(frontmatter): expose workspace schema API"
```

---

### Task 3: Browser API and preservation-safe frontmatter utility

**Files:**
- Create: `frontend/lib/api/frontmatter-schemas.ts`
- Create: `frontend/lib/api/frontmatter-schemas.test.ts`
- Create: `frontend/lib/frontmatterSchema.ts`
- Create: `frontend/lib/frontmatterSchema.test.ts`

**Interfaces:**
- Produces: frontend equivalents of `FrontmatterField`, `FrontmatterSchema`, and `FrontmatterSchemaInput`.
- Produces: `listFrontmatterSchemas`, `createFrontmatterSchema`, `updateFrontmatterSchema`, and `deleteFrontmatterSchema`.
- Produces: `readFrontmatterValues(content, fields): Record<string, string>` and `applyFrontmatterSchema(content, fields, values): { value: string; caret: number }`.

- [ ] **Step 1: Write failing typed API adapter tests**

```ts
it('uses encoded workspace schema routes and JSON bodies', async () => {
  await listFrontmatterSchemas('workspace/a');
  expect(apiFetch).toHaveBeenCalledWith('/workspaces/workspace%2Fa/frontmatter-schemas');
  await createFrontmatterSchema('workspace/a', input);
  expect(apiFetch).toHaveBeenLastCalledWith('/workspaces/workspace%2Fa/frontmatter-schemas', {
    method: 'POST',
    body: JSON.stringify(input),
  });
});

it('encodes schema ids and requests a void delete response', async () => {
  await updateFrontmatterSchema('w1', 'schema/1', { name: 'Changed' });
  expect(apiFetch).toHaveBeenLastCalledWith('/workspaces/w1/frontmatter-schemas/schema%2F1', expect.objectContaining({ method: 'PATCH' }));
  await deleteFrontmatterSchema('w1', 'schema/1');
  expect(apiFetch).toHaveBeenLastCalledWith('/workspaces/w1/frontmatter-schemas/schema%2F1', { method: 'DELETE', responseKind: 'void' });
});
```

- [ ] **Step 2: Write failing utility tests for parsing and non-destructive application**

```ts
it('reads supported values from an existing frontmatter block', () => {
  const content = '---\ntitle: "Guide"\ntags: [api, public]\ndraft: false\npriority: 3\n---\n\n# Body';
  expect(readFrontmatterValues(content, fields)).toEqual({ title: 'Guide', tags: 'api, public', draft: 'false', priority: '3' });
});

it('updates managed fields while preserving unknown YAML and the body', () => {
  const content = '---\ntitle: Old\nowner: platform\ncustom:\n  nested: true\n---\n\n# Body';
  const result = applyFrontmatterSchema(content, fields, { title: 'New guide', tags: 'api, public', draft: 'true', priority: '4' });
  expect(result.value).toBe('---\ntitle: "New guide"\nowner: platform\ncustom:\n  nested: true\ntags: ["api", "public"]\ndraft: true\npriority: 4\n---\n\n# Body');
  expect(result.caret).toBe(result.value.indexOf('\n---\n') + 1);
});

it('creates frontmatter without changing Markdown and supports CRLF input', () => {
  const result = applyFrontmatterSchema('# Body\r\n', [textField], { owner: 'Docs team' });
  expect(result.value).toBe('---\r\nowner: "Docs team"\r\n---\r\n\r\n# Body\r\n');
});

it('rejects missing required, invalid number, boolean, date, and select values', () => {
  expect(() => applyFrontmatterSchema('# Body', [requiredText], { owner: '' })).toThrow('Owner is required');
  expect(() => applyFrontmatterSchema('# Body', [numberField], { priority: 'high' })).toThrow('Priority must be a number');
  expect(() => applyFrontmatterSchema('# Body', [booleanField], { draft: 'yes' })).toThrow('Draft must be true or false');
  expect(() => applyFrontmatterSchema('# Body', [dateField], { reviewed: '28/08/2026' })).toThrow('Reviewed must use YYYY-MM-DD');
  expect(() => applyFrontmatterSchema('# Body', [selectField], { stage: 'unknown' })).toThrow('Stage has an unsupported value');
});
```

- [ ] **Step 3: Run focused tests and verify they fail**

Run: `cd frontend && npm test -- lib/api/frontmatter-schemas.test.ts lib/frontmatterSchema.test.ts --runInBand`

Expected: FAIL because neither browser boundary exists.

- [ ] **Step 4: Implement the typed API adapter**

Use `encodeURIComponent` for both workspace and schema identifiers, `apiFetch<FrontmatterSchema[]>` for list, `apiFetch<FrontmatterSchema>` for create/update, and `{ responseKind: 'void' }` for delete. Keep `fields` ordered and do not coerce `defaultValue`.

- [ ] **Step 5: Implement the dependency-free frontmatter utility**

The utility must:

1. Detect a leading `---` block with either LF or CRLF; when absent, keep the whole input as body.
2. Split frontmatter into top-level entry blocks: a line matching `^([A-Za-z][A-Za-z0-9_-]{0,63}):(?:[ \t]*(.*))?$` starts an entry, and subsequent indented/comment/blank lines stay attached until the next top-level key.
3. Decode only managed scalar values: quoted JSON strings, unquoted text, booleans, finite numbers, and inline lists `[a, "b"]`. Return a field's `defaultValue` when its key is absent.
4. Validate values by field type and required flag before changing content.
5. Replace each existing managed entry block in place; append missing managed entries in schema order immediately before the closing delimiter; leave every unmanaged entry block byte-for-byte unchanged.
6. Serialize text/date/select with `JSON.stringify(value)`, finite numbers without quotes, booleans as `true`/`false`, and comma-separated list input as a JSON-quoted inline YAML array.
7. Return the caret immediately before the closing `---`; callers restore focus through the editor's existing caret effect.

Export the result type exactly as:

```ts
export interface FrontmatterApplication {
  value: string;
  caret: number;
}
```

- [ ] **Step 6: Run focused tests and static checks**

Run: `cd frontend && npm test -- lib/api/frontmatter-schemas.test.ts lib/frontmatterSchema.test.ts --runInBand && npm run lint && npm run typecheck`

Expected: adapter/utility suites, lint, and typecheck pass.

- [ ] **Step 7: Commit the browser boundaries**

```bash
git add frontend/lib/api/frontmatter-schemas.ts frontend/lib/api/frontmatter-schemas.test.ts frontend/lib/frontmatterSchema.ts frontend/lib/frontmatterSchema.test.ts
git commit -m "feat(frontmatter): add schema browser boundaries"
```

---

### Task 4: Accessible schema form and workspace manager

**Files:**
- Create: `frontend/components/FrontmatterSchemaDialog.tsx`
- Create: `frontend/components/FrontmatterSchemaDialog.test.tsx`
- Create: `frontend/components/FrontmatterSchemaManager.tsx`
- Create: `frontend/components/FrontmatterSchemaManager.test.tsx`

**Interfaces:**
- Produces: `<FrontmatterSchemaDialog schemas content open onClose onApply onManage canManage />`.
- Produces: `<FrontmatterSchemaManager workspaceId schemas open onClose onChanged />`.
- Consumes: Task 3 types, CRUD adapters, `readFrontmatterValues`, and `applyFrontmatterSchema`.

- [ ] **Step 1: Write failing dialog tests for generated controls and validation**

```tsx
it('prefills fields from Markdown and applies the selected schema', async () => {
  const user = userEvent.setup();
  const onApply = jest.fn();
  render(<FrontmatterSchemaDialog schemas={[basic]} content={'---\ntitle: Old\nstatus: draft\n---\n\n# Body'} open onClose={jest.fn()} onApply={onApply} onManage={jest.fn()} canManage />);
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Old');
  await user.clear(screen.getByRole('textbox', { name: 'Title' }));
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'New title');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'published');
  await user.click(screen.getByRole('button', { name: 'Apply frontmatter' }));
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ value: expect.stringContaining('title: "New title"') }));
});

it('shows validation without changing the document and hides management from viewers', async () => {
  const user = userEvent.setup();
  const onApply = jest.fn();
  render(<FrontmatterSchemaDialog schemas={[requiredSchema]} content="# Body" open onClose={jest.fn()} onApply={onApply} onManage={jest.fn()} canManage={false} />);
  await user.click(screen.getByRole('button', { name: 'Apply frontmatter' }));
  expect(screen.getByText('Owner is required')).toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Manage schemas' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Write failing manager tests for field rows and CRUD failures**

Test creating a schema with two ordered field rows; changing a field type to `select` and entering newline-separated options; editing/deleting controls only for `builtIn: false`; confirmation text `Delete schema "<name>"? Existing document frontmatter will not change.`; form values preserved after `ApiError`; and `onChanged` called after successful create/update/delete.

- [ ] **Step 3: Run component tests and verify they fail**

Run: `cd frontend && npm test -- FrontmatterSchemaDialog.test.tsx FrontmatterSchemaManager.test.tsx --runInBand`

Expected: FAIL because both components do not exist.

- [ ] **Step 4: Implement the accessible schema dialog**

Compose the existing `Modal` and native labelled controls. The first control selects a schema with built-in/workspace optgroups. On schema selection or modal open, call `readFrontmatterValues(content, selected.fields)` and seed absent values from `defaultValue`. Render:

- `input type="text"` for `text` and `list` (`list` help text: `Comma-separated values`).
- `input type="number"` for `number`.
- `input type="date"` for `date`.
- `select` with `true`/`false` for `boolean`.
- `select` with the schema's options for `select`.

Submit label is `Apply frontmatter`. Catch utility validation errors into an `aria-live="polite"` region and do not call `onApply`. `Manage schemas` appears only when `canManage` and calls `onManage` without changing content.

- [ ] **Step 5: Implement the custom schema manager**

Compose `Modal`, `Input`, `Button`, and native controls. The controlled form shape is:

```ts
const EMPTY_FORM: FrontmatterSchemaInput = {
  name: '',
  description: '',
  fields: [{ key: '', label: '', type: 'text', required: false, options: [], defaultValue: '' }],
};
```

Provide `Add field`, `Remove <label-or-key-or-field-number>`, key, label, type, required checkbox, default value, and newline-separated options for select fields. Preserve field order. Require schema name, at least one field, every key/label, and select options before calling the API. Disable actions while awaiting a request, keep the form after failure, reset after success, and invoke `onChanged`. Built-ins render as read-only rows.

- [ ] **Step 6: Run component tests and static checks**

Run: `cd frontend && npm test -- FrontmatterSchemaDialog.test.tsx FrontmatterSchemaManager.test.tsx --runInBand && npm run lint && npm run typecheck`

Expected: component suites, lint, and typecheck pass.

- [ ] **Step 7: Commit the UI components**

```bash
git add frontend/components/FrontmatterSchemaDialog.tsx frontend/components/FrontmatterSchemaDialog.test.tsx frontend/components/FrontmatterSchemaManager.tsx frontend/components/FrontmatterSchemaManager.test.tsx
git commit -m "feat(frontmatter): add schema editor UI"
```

---

### Task 5: Editor integration, public docs, and full verification

**Files:**
- Modify: `frontend/app/documents/edit/page.tsx`
- Modify: `frontend/app/documents/edit/page.test.tsx`
- Modify: `frontend/README.md`
- Modify: `backend/README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/engineering/change-log.md`

**Interfaces:**
- Consumes: schema API, dialog, manager, and application result from Tasks 3–4.
- Preserves: current Markdown state, snippet insertion, link autocomplete, preview rendering, revision loading, and `POST /workspaces/:id/documents` save behavior.

- [ ] **Step 1: Extend editor tests with failing schema integration scenarios**

```tsx
it('applies schema frontmatter without losing body or unmanaged YAML', async () => {
  const user = userEvent.setup();
  renderPage();
  const editor = await screen.findByRole('textbox', { name: 'Markdown editor' });
  fireEvent.change(editor, { target: { value: '---\nowner: platform\n---\n\n# Body' } });
  await user.click(await screen.findByRole('button', { name: 'Frontmatter' }));
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'API guide');
  await user.click(screen.getByRole('button', { name: 'Apply frontmatter' }));
  expect(editor).toHaveValue(expect.stringContaining('owner: platform'));
  expect(editor).toHaveValue(expect.stringContaining('title: "API guide"'));
  expect(editor).toHaveValue(expect.stringContaining('# Body'));
  await waitFor(() => expect(editor).toHaveFocus());
});

it('reloads schema management without changing the draft', async () => {
  const user = userEvent.setup();
  renderPage();
  const editor = await screen.findByRole('textbox', { name: 'Markdown editor' });
  fireEvent.change(editor, { target: { value: '# Unsaved draft' } });
  await user.click(await screen.findByRole('button', { name: 'Frontmatter' }));
  await user.click(screen.getByRole('button', { name: 'Manage schemas' }));
  await user.click(screen.getByRole('button', { name: 'Reload schemas' }));
  expect(listFrontmatterSchemas).toHaveBeenCalledTimes(2);
  expect(editor).toHaveValue('# Unsaved draft');
});

it('keeps the editor and existing save path usable when schema loading fails', async () => {
  jest.mocked(listFrontmatterSchemas).mockRejectedValue(new Error('offline'));
  renderPage();
  expect(await screen.findByRole('textbox', { name: 'Markdown editor' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
});
```

- [ ] **Step 2: Run the editor test and verify the new scenarios fail**

Run: `cd frontend && npm test -- app/documents/edit/page.test.tsx --runInBand`

Expected: FAIL because the editor still inserts a fixed frontmatter string and does not load schemas.

- [ ] **Step 3: Integrate schema loading and application**

Add `schemas`, `schemaDialogOpen`, and `schemaManagerOpen` state plus a memoized `loadSchemas` keyed by `ws`. Replace `insertFrontmatter` with a handler that opens `FrontmatterSchemaDialog`; do not reject documents that already have frontmatter. When the dialog returns `{ value, caret }`, assign `caretRef.current`, update `content`, close the dialog, clear autocomplete, and switch preview-only mode to split. Keep the toolbar button name `Frontmatter` and show schema management only to Owner/Editor.

Render `FrontmatterSchemaManager` with `onChanged={loadSchemas}`. Loading or CRUD failures must not change `content`, `filePath`, `commitMsg`, `snippetSelectionRef`, or the existing save request.

- [ ] **Step 4: Update public documentation and roadmap**

Document schema endpoints and the six field types in both package READMEs. Explain that applying a schema updates supported frontmatter fields in the browser, preserves unmanaged YAML/body content, and persists only through normal Save. Mark `Custom frontmatter schemas` complete in `ROADMAP.md`. Add a change-log entry covering zero-setup built-in fields, tenant-scoped custom schemas, advisory validation, and compatibility with Git/CI/import.

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
git add frontend/app/documents/edit/page.tsx frontend/app/documents/edit/page.test.tsx frontend/README.md backend/README.md ROADMAP.md docs/engineering/change-log.md docs/superpowers/plans/2026-08-28-custom-frontmatter-schemas.md
git commit -m "feat(frontmatter): apply custom metadata schemas"
```

---

## Self-Review

- Spec coverage: the plan covers a zero-setup built-in, tenant-scoped CRUD, role enforcement, stable DTOs, six bounded field types, required/default/option validation, non-destructive YAML updates, accessible management, failure fallback, documentation, and full verification.
- Scope control: schemas remain an editor aid. No document write interception, schema assignment model, migration engine, frontend YAML dependency, or persistence architecture change is introduced.
- Placeholder scan: every behavior has an exact file, interface, test scenario, implementation rule, command, and expected result; there are no deferred implementation markers.
- Type consistency: backend and frontend share `id`, `name`, `description`, `fields`, `builtIn`; fields share `key`, `label`, `type`, `required`, `options`, `defaultValue`; all item routes use `schemaId`.
