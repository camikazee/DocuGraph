# Engineering Change Log

This records substantial engineering changes and their verification. It does
not replace Git history or the product roadmap.

## 2026-08-28 — Reusable document snippets

- Added three immutable, zero-setup Markdown snippets and tenant-scoped custom
  snippet libraries with Owner/Editor management.
- Added selection-safe editor insertion with normalized blank lines, restored
  focus and caret position, plus searchable built-in/workspace sections.
- Kept insertion browser-only until the user invokes the normal document save,
  preserving the existing filesystem-first persistence path.
- Covered tenant isolation, authorization, stable DTOs, CRUD failures, API
  adapters, accessible selection, and editor draft preservation.

## 2026-08-28 — Document templates

- Added three immutable built-in Markdown templates available immediately after
  installation and tenant-scoped custom templates stored in MongoDB.
- Added Owner/Editor management with stable public DTOs; all workspace members
  can use templates without seeing internal database identifiers.
- Kept template application deliberately simple: it prefills editable fields
  and never bypasses the existing filesystem-first document write path.
- Covered domain behavior, authorization, tenant isolation, API adapters,
  accessible selection, management failures, and draft-preserving reloads.

## 2026-08-28 — Open-source hardening foundation

- Defined the stable Next.js, NestJS, MongoDB, and filesystem architecture.
- Added frontend, backend, HTTP, and testing contracts for contributors.
- Added executable documentation validation to prevent contract drift.
- Aligned package metadata, CI, Jenkins, and Docker on Node.js 20.19+ so the
  documented runtime matches the in-memory MongoDB test dependency.
- Centralized JSON, multipart, blob, and empty-response handling in the browser
  API client and removed direct authenticated `fetch` calls from components.
- Added stale-request cancellation, complete dialog focus handling, and an
  explicit no-index/no-referrer policy for the application and token shares.
- Extracted manual Git publication into a focused, unit-tested NestJS use case.
- Made Markdown writes atomic and added Owner-only disk/index consistency
  diagnostics with explicit recovery through the existing reindex operation.
- Added MongoDB-backed durable jobs for watcher e-mail and automatic Git push;
  retries survive process restarts without making Redis mandatory, and finished
  job records expire automatically after 30 days.
- Added an optional Jenkins post-deploy read-only smoke for frontend, liveness,
  readiness, and authenticated documentation health.
