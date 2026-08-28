# DocuGraph Open-Source Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen DocuGraph as an easy-to-install, capable open-source documentation system without changing its Next.js, NestJS, MongoDB, filesystem, or two-image architecture.

**Architecture:** Next.js remains the browser application and NestJS remains the REST API. MongoDB stores indexes and application state while workspace Markdown remains filesystem-backed; new durability mechanisms use MongoDB and do not require Redis, PostgreSQL, Symfony, or an additional mandatory service. Refactoring extracts focused adapters and use cases inside the existing feature-module layout.

**Tech Stack:** Node.js 20.19+, Next.js 14, React 18, NestJS 10, MongoDB 7, Mongoose 8, Jest, React Testing Library, Supertest, Docker Compose, GitHub Actions, Jenkins.

## Global Constraints

- Preserve the existing Next.js + NestJS + MongoDB + filesystem architecture.
- Preserve separate frontend and backend production images.
- Do not add a mandatory external service; the default `docker compose up` installation stays self-contained.
- Keep product and UI copy in English.
- Keep Markdown files as the recoverable source of truth and MongoDB as the query index.
- Keep public identifiers as UUIDs or file paths; do not expose MongoDB `_id` values.
- Every mutation changed by this plan must test success, rejection, and partial-failure behavior.
- Run the affected lint, typecheck, unit tests, build, and available E2E checks after each task.

---

### Task 1: Repository engineering contract

**Files:**
- Create: `AGENTS.md`
- Create: `docs/engineering/architecture.md`
- Create: `docs/engineering/frontend-rules.md`
- Create: `docs/engineering/backend-rules.md`
- Create: `docs/engineering/http-contract.md`
- Create: `docs/engineering/testing-rules.md`
- Create: `docs/engineering/change-log.md`
- Modify: `docs/decisions/0001-product-ui-language-english.md`
- Create: `scripts/validate-project-docs.sh`
- Create: `scripts/validate-project-docs.test.sh`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: existing `Readme.md`, `ROADMAP.md`, `SECURITY.md`, and `DEPLOY.md`.
- Produces: a short repository contract and executable documentation validator used by both local contributors and CI.

- [x] **Step 1: Write the failing validator test**

```bash
#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test -x "$root/scripts/validate-project-docs.sh"
"$root/scripts/validate-project-docs.sh"
```

- [x] **Step 2: Run the test and verify it fails**

Run: `bash scripts/validate-project-docs.test.sh`
Expected: non-zero because `AGENTS.md` and engineering documents do not exist yet.

- [x] **Step 3: Add the contract and focused engineering documents**

`AGENTS.md` must require reading the architecture and area rules, preserving the stack, using API adapters instead of component-level `fetch`, keeping controllers thin, adding ADRs before architecture changes, updating the engineering change log after substantial work, and running affected quality gates.

`docs/engineering/architecture.md` must declare the unchanged topology and the filesystem/Mongo consistency model. The frontend, backend, HTTP, and testing documents must define exact boundaries and Definition of Done without duplicating deployment or security manuals.

- [x] **Step 4: Implement the validator**

```bash
#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
required=(
  AGENTS.md Readme.md ROADMAP.md SECURITY.md DEPLOY.md
  docs/engineering/architecture.md
  docs/engineering/frontend-rules.md
  docs/engineering/backend-rules.md
  docs/engineering/http-contract.md
  docs/engineering/testing-rules.md
  docs/engineering/change-log.md
  docs/decisions/0001-product-ui-language-english.md
)
for file in "${required[@]}"; do
  test -s "$root/$file" || { echo "Missing project document: $file" >&2; exit 1; }
done
```

- [x] **Step 5: Add `./scripts/validate-project-docs.sh` to both CI jobs before builds**

Run: `bash scripts/validate-project-docs.test.sh`
Expected: PASS.

---

### Task 2: Supported Node version

**Files:**
- Modify: `backend/package.json`
- Modify: `frontend/package.json`
- Modify: `backend/README.md`
- Modify: `frontend/README.md`
- Modify: `Readme.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `Jenkinsfile`
- Modify: `backend/Dockerfile`
- Modify: `frontend/Dockerfile`

**Interfaces:**
- Consumes: `mongodb-memory-server@11.2.0`, which requires Node.js 20.19+.
- Produces: one supported runtime floor, `>=20.19.0`, across package metadata, docs, CI, and containers.

- [x] **Step 1: Add an engine assertion to the documentation validator test**

```bash
node -e "for (const p of ['backend/package.json','frontend/package.json']) { const v=require('./'+p).engines.node; if (v !== '>=20.19.0') throw new Error(p+' has '+v) }"
```

- [x] **Step 2: Verify the assertion fails with the current `>=18.18.0` declarations**

Run: `bash scripts/validate-project-docs.test.sh`
Expected: FAIL and identify the old engine declaration.

- [x] **Step 3: Set all development and build environments to Node 20.19 or newer**

Use `node:20.19-bookworm-slim`, `node:20.19-alpine`, `node:20.19-bookworm`, and `node-version: '20.19.0'` where exact tags are accepted.

- [x] **Step 4: Run metadata and builds**

Run: `bash scripts/validate-project-docs.test.sh && (cd backend && npm run build) && (cd frontend && npm run build)`
Expected: PASS.

---

### Task 3: Unified browser API client

**Files:**
- Modify: `frontend/lib/api.ts`
- Create: `frontend/lib/api.test.ts`
- Create: `frontend/lib/api/documents.ts`
- Create: `frontend/lib/api/media.ts`
- Modify: `frontend/app/documents/page.tsx`
- Modify: `frontend/app/documents/view/page.tsx`
- Modify: `frontend/app/media/page.tsx`

**Interfaces:**
- Consumes: `getToken(): string | null` from `frontend/lib/auth.ts`.
- Produces: `apiJson<T>()`, `apiForm<T>()`, `apiBlob()`, `apiVoid()`, `isAbortError()`, `documentsApi`, and `mediaApi`.

- [x] **Step 1: Test JSON, empty, multipart, blob, error, and abort behavior**

The tests must assert that JSON requests set `Content-Type`, FormData requests do not override the browser boundary, `204` resolves without JSON parsing, blob responses remain blobs, backend message arrays become one `ApiError`, and an aborted request remains identifiable with `isAbortError`.

- [x] **Step 2: Run the focused test and verify missing exports fail**

Run: `cd frontend && npm test -- --runInBand lib/api.test.ts`
Expected: FAIL because the new client functions are not exported.

- [x] **Step 3: Implement one internal request function and the four response helpers**

The request function accepts `RequestInit`, adds Bearer auth, sets JSON content type only for string bodies, parses errors consistently, and forwards `signal` untouched.

- [x] **Step 4: Move document download/import/read-event and media upload calls into domain adapters**

Components may call adapter functions but must not construct API URLs or authorization headers.

- [x] **Step 5: Verify no component-level `fetch` remains**

Run: `! rg -n '\bfetch\(' frontend/app frontend/components --glob '*.ts' --glob '*.tsx'`
Expected: PASS.

- [x] **Step 6: Run frontend gates**

Run: `cd frontend && npm run lint && npm run typecheck && npm test -- --runInBand && npm run build`
Expected: PASS.

---

### Task 4: Stale-request protection

**Files:**
- Create: `frontend/lib/useLatestRequest.ts`
- Create: `frontend/lib/useLatestRequest.test.ts`
- Modify: `frontend/components/CommandPalette.tsx`
- Modify: `frontend/app/search/page.tsx`
- Modify: `frontend/app/media/page.tsx`

**Interfaces:**
- Produces: `useLatestRequest(): { nextSignal(): AbortSignal; abort(): void }`.
- Guarantees: starting a new load aborts the previous load and unmount aborts the active request.

- [x] **Step 1: Write a hook test that starts two requests and expects the first signal to be aborted**

Run: `cd frontend && npm test -- --runInBand lib/useLatestRequest.test.ts`
Expected: FAIL because the hook does not exist.

- [x] **Step 2: Implement the hook with one `AbortController` ref and unmount cleanup**

- [x] **Step 3: Apply it to search, command palette, and media reloads**

Abort errors must not display error toasts or replace current results.

- [x] **Step 4: Run frontend gates**

Run: `cd frontend && npm run lint && npm run typecheck && npm test -- --runInBand`
Expected: PASS.

---

### Task 5: Accessible modal and crawler policy

**Files:**
- Modify: `frontend/components/ui/Modal.tsx`
- Create: `frontend/components/ui/Modal.test.tsx`
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/share/[token]/page.tsx`
- Modify: `frontend/next.config.mjs`

**Interfaces:**
- Modal guarantees: labelled dialog, initial focus, Tab/Shift+Tab containment, Escape/backdrop close, scroll lock, and focus restoration.
- HTTP policy: application pages and token shares emit `noindex`; share responses use a no-referrer policy.

- [x] **Step 1: Test focus entry, focus wrapping, Escape, and restoration**

Run: `cd frontend && npm test -- --runInBand components/ui/Modal.test.tsx`
Expected: FAIL on focus management.

- [x] **Step 2: Implement focus lifecycle and `aria-labelledby` with `useId`**

- [x] **Step 3: Set root metadata robots to `{ index: false, follow: false }`**

- [x] **Step 4: Add security headers for `/share/:path*`**

Configure `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow, noarchive`.

- [x] **Step 5: Run frontend gates**

Run: `cd frontend && npm run lint && npm run typecheck && npm test -- --runInBand && npm run build`
Expected: PASS.

---

### Task 6: Thin Git-publish controller

**Files:**
- Create: `backend/src/documents/publish-documents.service.ts`
- Create: `backend/src/documents/publish-documents.service.spec.ts`
- Modify: `backend/src/documents/documents.module.ts`
- Modify: `backend/src/documents/documents.controller.ts`

**Interfaces:**
- Produces: `PublishDocumentsService.execute(workspaceId, actor, message): Promise<PublishResult>`.
- `actor` contains `{ id: string | null; authType: 'jwt' | 'apiKey' }`.

- [x] **Step 1: Test missing remote, JWT author resolution, CI fallback author, Git failure, and audit success**

Run: `cd backend && npm test -- --runInBand publish-documents.service.spec.ts`
Expected: FAIL because the service does not exist.

- [x] **Step 2: Move orchestration from the controller into the new service**

The audit entry is written only after `GitPublishService.publish()` succeeds.

- [x] **Step 3: Reduce the controller method to DTO/context mapping and one service call**

- [x] **Step 4: Run backend gates**

Run: `cd backend && npm run lint && npm test -- --runInBand && npm run build`
Expected: PASS.

---

### Task 7: Atomic Markdown writes and consistency diagnostics

**Files:**
- Modify: `backend/src/documents/workspace-storage.service.ts`
- Modify: `backend/src/documents/workspace-storage.service.spec.ts`
- Create: `backend/src/documents/document-consistency.service.ts`
- Create: `backend/src/documents/document-consistency.service.spec.ts`
- Modify: `backend/src/documents/documents.module.ts`
- Modify: `backend/src/documents/documents.controller.ts`

**Interfaces:**
- `WorkspaceStorageService.writeFile()` writes a sibling temporary file, fsyncs, renames atomically, and cleans the temporary file on failure.
- `DocumentConsistencyService.check(workspaceId)` returns `{ ok, missingOnDisk, missingInIndex, contentMismatch }`.

- [x] **Step 1: Test atomic rename and cleanup after simulated rename failure**

- [x] **Step 2: Implement temporary-file write using a random sibling name and `rename`**

- [x] **Step 3: Test all three consistency difference classes using mocked storage and model records**

- [x] **Step 4: Add Owner-only `GET /workspaces/:id/documents/consistency`**

The endpoint is diagnostic and read-only; existing `source/index` remains the explicit recovery action.

- [x] **Step 5: Run backend gates**

Run: `cd backend && npm run lint && npm test -- --runInBand && npm run build`
Expected: PASS.

---

### Task 8: Durable side-effect jobs without a new service

**Files:**
- Create: `backend/src/jobs/schemas/job.schema.ts`
- Create: `backend/src/jobs/jobs.module.ts`
- Create: `backend/src/jobs/jobs.service.ts`
- Create: `backend/src/jobs/jobs.service.spec.ts`
- Create: `backend/src/jobs/jobs.worker.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/documents/documents.module.ts`
- Modify: `backend/src/documents/auto-publish.service.ts`
- Modify: `backend/src/documents/documents.service.ts`

**Interfaces:**
- `JobsService.enqueue(kind, payload, idempotencyKey): Promise<void>` inserts once by unique key.
- `JobsService.claimNext(workerId): Promise<Job | null>` atomically leases one due job.
- `JobsService.complete(uuid)` and `JobsService.fail(uuid, error)` update durable state with bounded exponential retry.
- Initial kinds: `document-email` and `git-auto-publish`.

- [x] **Step 1: Test deduplication, atomic claim, completion, retry scheduling, and terminal failure**

Run: `cd backend && npm test -- --runInBand jobs.service.spec.ts`
Expected: FAIL because the jobs module does not exist.

- [x] **Step 2: Implement the Mongo job schema with UUID, unique idempotency key, status, lease, attempts, and `runAt` indexes**

- [x] **Step 3: Implement atomic claim with `findOneAndUpdate` sorted by `runAt`**

- [x] **Step 4: Register a scheduled worker that dispatches known kinds and safely ignores concurrent leases**

- [x] **Step 5: Replace process-memory Git scheduling with durable enqueue**

Preserve coalescing by using a workspace-and-content-revision idempotency key.

- [x] **Step 6: Queue watcher e-mail after in-app notifications instead of awaiting SMTP in the document mutation**

- [x] **Step 7: Run backend unit and relevant notification/Git E2E tests**

Run: `cd backend && npm run lint && npm test -- --runInBand && npm run build`
Expected: PASS; E2E runs when the environment permits local Mongo ports.

---

### Task 9: Failure-path tests and production smoke

**Files:**
- Create: `backend/src/documents/document-mutation-failures.spec.ts`
- Create: `scripts/smoke-production-readonly.sh`
- Create: `scripts/smoke-production-readonly.test.sh`
- Modify: `Jenkinsfile`
- Modify: `DEPLOY.md`
- Modify: `docs/engineering/change-log.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Smoke inputs: `FRONTEND_URL`, `API_URL`, optional `DG_TOKEN`.
- Smoke performs only GET requests: frontend, `/health`, `/ready`, optional `/ci/whoami` and documents health.

- [x] **Step 1: Add mutation failure tests**

Tests must cover disk failure before Mongo mutation, Mongo failure after an atomic disk write with consistency diagnosis, queued e-mail surviving SMTP failure, and durable Git job retry after a simulated publish failure.

- [x] **Step 2: Write a smoke-script test using a temporary local HTTP fixture**

The fixture must verify successful paths and prove that a non-2xx readiness response fails the script.

- [x] **Step 3: Implement the read-only smoke script with retries capped at 90 seconds**

- [x] **Step 4: Add optional Jenkins parameters `POST_DEPLOY_FRONTEND_URL`, `POST_DEPLOY_API_URL`, and `POST_DEPLOY_DG_TOKEN_CREDENTIALS_ID`**

The smoke stage runs only when both URLs are supplied and executes after the deploy webhook.

- [x] **Step 5: Update operations and engineering documentation**

Record the unchanged architecture, Node floor, API adapter, modal behavior, crawler policy, atomic storage, durable jobs, diagnostic endpoint, and post-deploy smoke.

- [x] **Step 6: Run all available gates**

Run: `./scripts/validate-project-docs.sh && ./scripts/smoke-production-readonly.test.sh && (cd backend && npm run lint && npm test -- --runInBand && npm run build) && (cd frontend && npm run lint && npm run typecheck && npm test -- --runInBand && npm run build)`
Expected: PASS. Run `backend/npm run test:e2e` where the host permits `mongodb-memory-server` to bind a local port.
