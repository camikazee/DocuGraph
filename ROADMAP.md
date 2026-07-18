# DocuGraph — Roadmap

A living checklist of where DocuGraph is and where it's going. Check items off
as they ship. Legend: `[x]` done · `[~]` in progress · `[ ]` planned.

---

## ✅ Shipped (current capabilities)

### Core
- [x] Auth: email/password (JWT), GitHub & Slack OAuth, password reset (SMTP)
- [x] Workspaces, members, invitations, roles (Owner / Editor / Viewer)
- [x] Documents as Markdown-as-code: two-phase save (disk = source of truth + Mongo index)
- [x] Revision history with per-revision diff (+/- line counts)
- [x] Markdown rendering: code highlighting + Mermaid, reading time, tags, raw/copy
- [x] Search + command palette (⌘K)
- [x] Structure builder

### Health & graph (the wedge)
- [x] Knowledge graph (nodes/edges) + backlinks
- [x] Health checks: broken links, orphans, stale pages
- [x] Per-document health badges + "Needs attention" filter
- [x] Broken-link report with single fix **and bulk fix** (server-side)
- [x] CI docs-health gate (`dg_live_` token → fail the build on broken links)

### Media
- [x] Pluggable storage volumes: Local / S3 / FTP / SFTP (VFS abstraction)
- [x] Encrypted credentials (AES-256-GCM), connection test, broken-asset detection, move

### Sync & publishing
- [x] Publish to Git, inbound webhooks, bidirectional auto-sync
- [x] Atom feed of recent changes
- [x] Static HTML export (single self-contained, read-only file)
- [x] Watching + notifications when a watched document changes

### Platform
- [x] 3 themes (Light / Grey / Violet), Statistics dashboard
- [x] Swagger (disabled in prod unless explicitly enabled)
- [x] Docker Compose stack (Mongo + backend + frontend + Mailpit)
- [x] 120 e2e tests, PolyForm Noncommercial license, DEPLOY.md + SECURITY.md
- [x] Internal landing page (separate repo)

---

## 🎯 Milestone 1 — Production hardening
*Make it safe and boring to run for real.*

- [x] **UUID public identifiers** — audit confirmed all public ids are UUID/filePath; closed the last raw `_id` leak in the full-document response (`updatedBy` now resolves to author name)
- [x] **Observability** — per-request id (`x-request-id`, echoed + in error bodies), HTTP access log, liveness `/health` + readiness `/ready` (503 when DB down)
- [ ] **Error tracking** — wire Sentry (or equivalent) on backend + frontend
- [x] **Audit log** — access/admin + document-level events (member joined/role changed/removed, invitation created/revoked, API key created/revoked, repository configured, published, document moved) with actor + target; Owner-only `GET /workspaces/:id/audit` and an Owner-only `/audit` view (linked from Team)
- [ ] **Backups** — documented Mongo backup/restore + volume snapshot story
- [ ] **Secrets** — production secret management (not `.env` on disk)
- [x] **CI pipeline** — GitHub Actions on every push/PR: backend (lint · unit · e2e · build) + frontend (typecheck · unit · build); enforced prettier across the backend
- [x] **Fix e2e DB isolation** — e2e now run on an in-memory Mongo per test file (`mongodb-memory-server`); no external DB, parallel-safe, 120/120 green out of the box (`MONGO_URI_TEST` still overrides to a real Mongo)
- [x] **Rate-limit tuning** — stricter, env-configurable throttle on auth endpoints (login/register/forgot/reset, default 10/60s) on top of the global limit; brute-force/enumeration protection with e2e

## 🎯 Milestone 2 — Notifications & collaboration
*Turn "watching" into a real collaboration loop.*

- [x] **In-app notifications page** — `/notifications` with All/Unread filter, mark-all-read, click-through (marks read); bell dropdown links to it
- [~] **More event types** — document changed, moved, and new comment now notify watchers (rename/delete/@mention still open)
- [~] **Email notifications** — instant email to opted-in watchers on watched-document events (digest still open)
- [~] **Notification preferences** — per-user email opt-in (`/notification-preferences`); per-workspace / per-document granularity still open
- [ ] **Comments & review workflow** — threads, resolve, request changes
- [ ] **@mentions** with autocomplete

## 🎯 Milestone 3 — Publishing & export
*Make published docs first-class.*

- [ ] **Multi-page static site export** (ZIP: nav + per-page HTML + assets)
- [ ] **Embed images in export** (self-contained, no live API needed)
- [ ] **Themed / branded export** + PDF export
- [ ] **Public read-only doc sites** (shareable link, optional auth)
- [ ] **Versioned docs** — publish from a branch / tag; doc version switcher

## 🎯 Milestone 4 — Search & scale
*Stay fast as workspaces grow.*

- [ ] **Full-text search** — Mongo text index (or Atlas Search) instead of in-memory filter
- [ ] **Pagination** everywhere (documents, media, revisions, notifications)
- [ ] **Caching** for graph / health computations on large workspaces
- [ ] **Graph performance** — virtualize / cluster large graphs
- [ ] **Bulk operations** — fix orphans, archive stale, bulk tag/move

## 🎯 Milestone 5 — Polish & DX
*The 20% that makes it feel finished.*

- [ ] **Frontend ESLint** — configure `next lint` (eslint-config-next) and add it to CI
- [ ] **Frontend test coverage** (components + key flows)
- [ ] **Accessibility audit** (keyboard, focus, contrast, reduced motion)
- [ ] **Mobile/responsive polish**
- [ ] **Onboarding & empty states** for every view
- [ ] **i18n** (the codebase already mixes EN/PL — pick a strategy)
- [ ] **Inline editor upgrades** — live preview, link autocomplete, frontmatter helper

---

## 💡 Backlog / ideas
*Unscheduled; promote into a milestone when it earns its place.*

- [ ] Real-time collaborative editing + presence
- [ ] Per-folder / per-path permissions
- [ ] AI assist: summarize, suggest links, detect duplicate/contradictory docs
- [ ] Slack/Teams app: post on publish, search docs from chat
- [ ] Import from existing docs (Notion / Confluence / GitBook)
- [ ] Templates & snippets, custom frontmatter schemas
- [ ] Analytics: most-read, dead pages, search-with-no-results
