# DocuGraph

[![CI](https://github.com/camikazee/DocuGraph/actions/workflows/ci.yml/badge.svg)](https://github.com/camikazee/DocuGraph/actions/workflows/ci.yml)

Developer documentation SaaS — Markdown-as-code with Git as the source of
truth and a MongoDB index. It indexes your Markdown into a living **knowledge
graph** with backlinks and **health checks** (broken links, orphans, stale
pages), a fast reader, a split editor, and pluggable media storage. NestJS 10
backend + Next.js 14 frontend.

## Quick start (self-hosted)

Docker Compose v2 is the only requirement. The installer generates unique
secrets, validates the configuration, starts the public images, and checks the
database, API, and frontend:

```bash
git clone https://github.com/camikazee/DocuGraph.git
cd DocuGraph
./scripts/install.sh
```

Open **http://localhost:3002** and create the first account. Existing `.env`
configuration and persistent volumes are always preserved. Useful variants:

```bash
./scripts/install.sh --build                         # build this checkout
./scripts/install.sh --url https://docs.example.com # custom public origin
./scripts/doctor.sh                                 # diagnose an installation
```

Only the frontend port is public. Browser requests to `/api/v1` are forwarded
to the separate backend container over the private network; MongoDB is never
published. The same frontend/backend images therefore work unchanged behind
any domain or reverse proxy. See [portable container installation](docs/install/containers.md)
for Portainer, VPS/NAS, Kubernetes, Nomad, upgrades, and rollback.

For native development use Node **20.19+**. With nvm, `nvm use` reads `.nvmrc`.

## Ready-to-explore demo

The isolated demo stack includes Mailpit and automatically creates sample
documents and these accounts (password **`Demo1234!`**):

```bash
docker compose -f docker-compose.demo.yml up -d --build
```

| Email                   | Role   |
| ----------------------- | ------ |
| owner@demo.docugraph    | Owner  |
| editor@demo.docugraph   | Editor |
| viewer@demo.docugraph   | Viewer |

### Reset the demo to a clean slate

The seed is **idempotent** — re-run it any time. For a pristine database
(wipes all data) use:

```bash
docker compose -f docker-compose.demo.yml down -v
docker compose -f docker-compose.demo.yml up -d --build
```

## What the fixture sets up

`backend/scripts/seed.mjs` populates a single workspace via the public API, so
it works against any running backend (local or Docker):

- **3 members** — owner, editor, viewer (one workspace).
- **7 documents** across `docs/`, `api/` and `guide/` folders with cross-links
  (incl. a sample with highlighted code + a Mermaid diagram), so the **graph**,
  **structure builder**, **search** and **reader** have real data.
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
- `docker-compose.yml` — production-safe self-hosted stack
- `docker-compose.demo.yml` — auto-seeded demo with Mailpit

Contributor architecture and quality contracts live in
[`docs/engineering`](docs/engineering); start with [`AGENTS.md`](AGENTS.md).

## Deployment & security

For production setup (secrets, TLS, persistent storage, hardening, connecting a
repo, CI gate) see
[DEPLOY.md](DEPLOY.md). Security model and reporting: [SECURITY.md](SECURITY.md).

## Demo & walkthrough

A guided tour with screenshots of the main views (and two-command local setup):
[docs/demo](docs/demo/README.md).

## Roadmap

What's shipped and what's next, as a checkable list: [ROADMAP.md](ROADMAP.md).

## License

**Free for noncommercial use.** You may use, copy, and modify DocuGraph for any
noncommercial purpose — personal projects, learning, non-profit, evaluation.
**Reselling it, charging for it, or any commercial use requires permission from
the author.** See [LICENSE](LICENSE) — [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0).
