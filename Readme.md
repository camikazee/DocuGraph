# DocuGraph

Developer documentation SaaS — Markdown-as-code with Git as the source of
truth and a MongoDB index. It indexes your Markdown into a living **knowledge
graph** with backlinks and **health checks** (broken links, orphans, stale
pages), a fast reader, a split editor, and pluggable media storage. NestJS 10
backend + Next.js 14 frontend.

## Quick start (dev)

Bring up the full stack and load a ready-to-explore demo workspace:

```bash
docker compose up -d --build      # mongo + backend + frontend + mailpit
cd backend && npm run seed        # fixtures: users, docs, media, members
```

Then open:

| Service          | URL                                   |
| ---------------- | ------------------------------------- |
| Frontend         | http://localhost:3002                 |
| API              | http://localhost:3000/api/v1          |
| API docs (Swagger)| http://localhost:3000/api/docs       |
| Mailpit (email)  | http://localhost:8025                 |

Sign in with any demo account (password **`Demo1234!`**):

| Email                   | Role   |
| ----------------------- | ------ |
| owner@demo.docugraph    | Owner  |
| editor@demo.docugraph   | Editor |
| viewer@demo.docugraph   | Viewer |

### Reset to a clean slate

The seed is **idempotent** — re-run it any time. For a pristine database
(wipes all data) use:

```bash
docker compose down -v && docker compose up -d
cd backend && npm run seed
```

## What the fixture sets up

`backend/scripts/seed.mjs` populates a single workspace via the public API, so
it works against any running backend (local or Docker):

- **3 members** — owner, editor, viewer (one workspace).
- **6 documents** across `docs/` and `api/` folders with cross-links, so the
  **graph**, **structure builder** and **search** have real data.
- **1 intentional broken link** (`api/auth.md` → `api/rate-limits.md`) to
  populate the **Broken links** report.
- **2 media assets** on the default local volume: `logo.png` embedded in
  `api/overview.md` (referenced) and `diagram.svg` left **unused**.

Override the target with `API_URL`:

```bash
API_URL=http://localhost:3000/api/v1 node backend/scripts/seed.mjs
```

## Layout

Monorepo:

- `backend/` — NestJS API (own README, `.env.example`, tests)
- `frontend/` — Next.js app (own README)
- `docker-compose.yml` — full demo stack (Mongo + backend + frontend + Mailpit)

## Deployment & security

The compose stack is dev/demo only. For production setup (secrets, TLS,
persistent storage, hardening, connecting a repo, CI gate) see
[DEPLOY.md](DEPLOY.md). Security model and reporting: [SECURITY.md](SECURITY.md).
