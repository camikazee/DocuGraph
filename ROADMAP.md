# DocuGraph — Roadmap

A living checklist of where DocuGraph is and where it's going. Check items off
as they ship. Legend: `[x]` done · `[~]` in progress · `[ ]` planned.

---

## ✅ Shipped (current capabilities)

### Core
- [x] Auth: email/password (JWT), GitHub & Slack OAuth, password reset (SMTP)
- [x] Transactional email from a shared branded template — password reset, watch notifications, daily digest, and **workspace invitations** (invite email with an accept link + `/invite` acceptance flow); log-only without SMTP
- [x] OAuth completes in the browser: GitHub/Slack callback redirects to the frontend with the token (in the URL fragment) and preserves a post-login `next` target via OAuth `state` — so an emailed invite is accepted whether the invitee signs in with email or OAuth
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
- [x] **CI pipeline** — GitHub Actions on every push/PR: backend (lint · unit · e2e · build) + frontend (lint · typecheck · unit · build); enforced prettier across the backend
- [x] **Fix e2e DB isolation** — e2e now run on an in-memory Mongo per test file (`mongodb-memory-server`); no external DB, parallel-safe, 120/120 green out of the box (`MONGO_URI_TEST` still overrides to a real Mongo)
- [x] **Rate-limit tuning** — stricter, env-configurable throttle on auth endpoints (login/register/forgot/reset, default 10/60s) on top of the global limit; brute-force/enumeration protection with e2e

## 🎯 Milestone 2 — Notifications & collaboration
*Turn "watching" into a real collaboration loop.*

- [x] **In-app notifications page** — `/notifications` with All/Unread filter, mark-all-read, click-through (marks read); bell dropdown links to it
- [x] **More event types** — watchers are notified on change, move, new comment, @mention, and deletion
- [x] **Email notifications** — instant email to opted-in watchers, plus an opt-in **daily digest** of unread notifications (scheduled cron)
- [x] **Notification preferences** — per-user email (instant + digest) opt-in and per-event-type mute (changes / moves / comments; mentions always notify) via `/notification-preferences`. Per-document control is covered by watch on/off; per-workspace granularity still open
- [x] **Comments & review workflow** — line-anchored comment threads with resolve/reopen, plus a **persisted per-document review status** (in review / approved / changes requested) recording who reviewed and when. Approve is gated on all threads being resolved; requesting changes notifies watchers (`review` notification kind, muteable). Status shows on the reader and in the review view; backed by a 7-scenario e2e.
- [x] **@mentions** — mention workspace members in a comment via `@` autocomplete; mentioned users get a `mention` notification (+ email if opted in)

## 🎯 Milestone 3 — Publishing & export
*Make published docs first-class.*

- [x] **Multi-page static site export** — ZIP with a page per document (folders preserved), a shared stylesheet, an index, and internal links/nav rewritten to relative `.html` paths (works from file://)
- [x] **Embed images in export** — referenced assets are inlined as base64 data URIs in both the single-file and ZIP exports, so they render without a live API (unreadable assets keep their original URL)
- [~] **Branded export** — exports are titled with the workspace name (single-file + ZIP). PDF export still open (needs headless Chromium)
- [x] **Public read-only shareable links** — an owner/editor (with write access) mints a revocable, optionally-expiring public link to a single document. The `/share/:token` page renders it read-only with code highlighting + Mermaid, no account needed; images are embedded so it's self-contained. Tokens are stored hashed (raw shown once, like CI tokens), the public endpoint leaks no internal ids and is rate-limited, and a share is an explicit per-file grant that bypasses ACL only for that file. Backed by a 5-scenario e2e. *(Whole-site public publishing still open.)*
- [ ] **Versioned docs** — publish from a branch / tag; doc version switcher

## 🎯 Milestone 4 — Search & scale
*Stay fast as workspaces grow.*

- [x] **Full-text search** — Mongo `$text` index (title + content, weighted) with scored results, snippets and facets; `/search` page + command palette
- [x] **Pagination** — cursor pagination (`limit` + `before`, "Load more") on the append-only/growing lists: notifications, audit, **revision history** (fetches one extra older revision so per-page diffs stay correct across the boundary), and the **media library** (filters pushed into the query so cursor paging is correct; overview stats stay a separate whole-set endpoint). The documents list stays whole by design — the graph, reader tree, search and dashboard all need the full set.
- [x] **Caching** — in-memory TTL cache (30s) for the graph and health computations per workspace, invalidated on document create/edit/move/delete so results stay fresh
- [x] **Graph performance** — viewport virtualization (nodes/edges outside the current zoom window aren't rendered) plus label culling (beyond ~140 visible nodes, labels show only on hubs, hover, and search matches) keep the SVG light on large graphs. An honest on-canvas notice reports when nodes/labels are being culled ("Showing X of Y nodes") so nothing is silently dropped. *(Force-directed clustering still open.)*
- [x] **Bulk operations** — multi-select on the documents page (owner/editor) with a bulk action bar: add/remove a tag, move into a folder (basename preserved), and delete. One `POST /documents/bulk` endpoint applies the op per path, enforces write access per file, and reports per-path success/failure without aborting the batch (tag edits rewrite frontmatter, preserving other fields). Backed by a 7-scenario e2e.

## 🎯 Milestone 5 — Polish & DX
*The 20% that makes it feel finished.*

- [x] **Frontend ESLint** — `next lint` configured (`next/core-web-vitals` + `next/typescript`, unused-vars as errors), runs at `--max-warnings=0` and gates CI. Migrated web fonts to `next/font` (self-hosted, no CDN `<link>`s) to clear the last lint warning
- [ ] **Frontend test coverage** (components + key flows)
- [ ] **Accessibility audit** (keyboard, focus, contrast, reduced motion)
- [ ] **Mobile/responsive polish**
- [ ] **Onboarding & empty states** for every view
- [ ] **i18n** (the codebase already mixes EN/PL — pick a strategy)
- [ ] **Inline editor upgrades** — live preview, link autocomplete, frontmatter helper

## 🎯 Milestone 6 — Content in/out & personal workspace
*Get whole trees in and out easily, and make the workspace personal. Ordered cheapest→heaviest.*

- [x] **Recently viewed** — per-user browsing history from read events (deduped by file, newest first, deleted docs dropped); `GET /documents/recently-viewed` + a "Recently viewed" section on the dashboard
- [x] **Favorites / bookmarks** — per-user bookmarks (`GET /documents/favorites`, `POST /documents/favorite`), a bookmark toggle in the reader, and a Favorites section on the dashboard (distinct from watch)
- [x] **Source download (raw `.md` ZIP)** — `GET /documents/export/source.zip` returns all docs as raw Markdown with folders preserved (distinct from the rendered site ZIP)
- [x] **ZIP import** — `POST /documents/import.zip` expands a `.md` tree into the workspace (paths preserved, non-md ignored, invalid zip rejected)
- [x] **Local directory upload** — pick a folder from disk (`webkitdirectory`) on the documents page; each `.md` is uploaded preserving the tree (top folder stripped)
- [x] **Private Git import** — optional GitHub token (stored AES-encrypted like other secrets, never returned — only `tokenConfigured`) enables importing private repos via the git blobs API; file cap raised 300→2000. Token config + no-leak covered by e2e (the private GitHub fetch itself needs a real private repo to verify live)
- [x] **Per-resource access control** — groups (named member sets) + path rules on top of workspace RBAC. A rule targets a folder (path ending `/`) or a single file, applies to Everyone / a group / a user, and grants `hidden` / `read` / `write`. Most-specific path wins (tie → highest level); Owner and CI bypass; no rules → workspace role. Hidden docs disappear from list/graph/search/exports and `by-path` 404s; writes are blocked with 403. Owner-only admin at `/access` (groups + rules) plus an in-reader **Access** panel to set rules on the open file/folder. Backed by a 6-scenario e2e (hide-folder-reveal-file, dev/client groups, read+write, owner bypass, search/graph filtering).

## 🎯 Milestone 7 — Public demo showcase (do last)
*Let anyone see it working straight from GitHub, once the features above exist.*

- [x] **Polished demo seed** — one-command `npm run seed` populates a realistic workspace (3 users, cross-linked docs incl. code + Mermaid, media, an intentional broken link).
- [x] **Demo walkthrough in the repo** — `docs/demo/` with a guided tour + current screenshots of the main views (dashboard, documents, graph, reader, media, connect) and run-it-yourself instructions, linked from the root README. *(Intentionally makes curated demo screenshots public — reverses the earlier "screenshots stay internal" call.)*
- [ ] **Optional live/preview** — a hosted demo people can click through (compose demo already documented).

---

## 💡 Backlog / ideas
*Unscheduled; promote into a milestone when it earns its place.*

- [ ] Real-time collaborative editing + presence
- [ ] AI assist: summarize, suggest links, detect duplicate/contradictory docs
- [ ] Slack/Teams app: post on publish, search docs from chat
- [ ] Import from existing docs (Notion / Confluence / GitBook)
- [ ] Templates & snippets, custom frontmatter schemas
- [ ] Analytics: most-read, dead pages, search-with-no-results
