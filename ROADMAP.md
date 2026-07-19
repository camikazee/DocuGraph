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
- [x] **More event types** — watchers are notified on change, move, new comment, @mention, and deletion
- [x] **Email notifications** — instant email to opted-in watchers, plus an opt-in **daily digest** of unread notifications (scheduled cron)
- [x] **Notification preferences** — per-user email (instant + digest) opt-in and per-event-type mute (changes / moves / comments; mentions always notify) via `/notification-preferences`. Per-document control is covered by watch on/off; per-workspace granularity still open
- [ ] **Comments & review workflow** — threads, resolve, request changes
- [x] **@mentions** — mention workspace members in a comment via `@` autocomplete; mentioned users get a `mention` notification (+ email if opted in)

## 🎯 Milestone 3 — Publishing & export
*Make published docs first-class.*

- [x] **Multi-page static site export** — ZIP with a page per document (folders preserved), a shared stylesheet, an index, and internal links/nav rewritten to relative `.html` paths (works from file://)
- [x] **Embed images in export** — referenced assets are inlined as base64 data URIs in both the single-file and ZIP exports, so they render without a live API (unreadable assets keep their original URL)
- [~] **Branded export** — exports are titled with the workspace name (single-file + ZIP). PDF export still open (needs headless Chromium)
- [ ] **Public read-only doc sites** (shareable link, optional auth)
- [ ] **Versioned docs** — publish from a branch / tag; doc version switcher

## 🎯 Milestone 4 — Search & scale
*Stay fast as workspaces grow.*

- [x] **Full-text search** — Mongo `$text` index (title + content, weighted) with scored results, snippets and facets; `/search` page + command palette
- [~] **Pagination** — cursor pagination (`limit` + `before`) with "Load more" on the append-only logs (notifications, audit); documents / media / revisions still open
- [x] **Caching** — in-memory TTL cache (30s) for the graph and health computations per workspace, invalidated on document create/edit/move/delete so results stay fresh
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

## 🎯 Milestone 6 — Content in/out & personal workspace
*Get whole trees in and out easily, and make the workspace personal. Ordered cheapest→heaviest.*

- [x] **Recently viewed** — per-user browsing history from read events (deduped by file, newest first, deleted docs dropped); `GET /documents/recently-viewed` + a "Recently viewed" section on the dashboard
- [ ] **Favorites / bookmarks** — star a document (per-user), a Favorites view, a star toggle in the reader and the list. Modelled on watch. *(small–medium)*
- [ ] **Source download (raw `.md` ZIP)** — download all docs as a ZIP of the raw Markdown with folders preserved (distinct from the rendered static-site export); "grab the whole directory". *(small — reuse JSZip)*
- [ ] **ZIP import** — upload a `.zip` of a `.md` tree and expand it into the structure (paths preserved). *(small–medium — reuse JSZip)*
- [ ] **Local directory upload** — pick or drag a folder from disk (`webkitdirectory` / folder drop) and mirror the whole tree via batch upsert. "Select a directory → it uploads the whole structure." *(medium)*
- [ ] **Private Git import** — token auth + drop the 300-file cap (extends the current public-GitHub indexing). *(medium)*
- [ ] **Per-resource access control** — per-folder / per-path permissions on top of workspace RBAC (Owner/Editor/Viewer already enforced). *(large)*

## 🎯 Milestone 7 — Public demo showcase (do last)
*Let anyone see it working straight from GitHub, once the features above exist.*

- [ ] **Polished demo seed** — one-command install populating a realistic workspace (extend `backend/scripts/seed.mjs`).
- [ ] **Demo walkthrough in the repo** — `docs/demo/` with current screenshots of the main views + step-by-step instructions, so the GitHub repo shows the product in practice. *(NB: this intentionally reverses the earlier "screenshots stay internal" decision — the owner now wants curated demo screenshots public.)*
- [ ] **Optional live/preview** — a hosted or one-command `docker compose` demo people can click through.

---

## 💡 Backlog / ideas
*Unscheduled; promote into a milestone when it earns its place.*

- [ ] Real-time collaborative editing + presence
- [ ] AI assist: summarize, suggest links, detect duplicate/contradictory docs
- [ ] Slack/Teams app: post on publish, search docs from chat
- [ ] Import from existing docs (Notion / Confluence / GitBook)
- [ ] Templates & snippets, custom frontmatter schemas
- [ ] Analytics: most-read, dead pages, search-with-no-results
