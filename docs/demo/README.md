# DocuGraph — live demo & walkthrough

A guided tour of DocuGraph with screenshots from the seeded demo workspace.
Everything below runs locally with **two commands** — no accounts, no cloud.

## Run it yourself (2 commands)

```bash
docker compose up -d --build     # mongo + backend + frontend + mailpit
cd backend && npm run seed       # demo workspace: users, docs, media, links
```

Then open **http://localhost:3002** and sign in with a demo account
(password **`Demo1234!`**):

| Email                   | Role   |
| ----------------------- | ------ |
| owner@demo.docugraph    | Owner  |
| editor@demo.docugraph   | Editor |
| viewer@demo.docugraph   | Viewer |

The seed is idempotent — re-run it anytime. For a clean slate:
`docker compose down -v && docker compose up -d && cd backend && npm run seed`.

---

## What you're looking at

### Dashboard — health & activity at a glance
Documentation health (broken links, orphans, stale), recent activity, watching,
favorites, and your recently-viewed documents.

![Dashboard](screens/01-dashboard.png)

### Documents — Markdown as code
Every doc is a Markdown file (Git is the source of truth, MongoDB is the index).
Tags, per-document health badges, a "Needs attention" filter, plus **Export**
(single HTML / static-site ZIP / raw `.md` ZIP) and **Import** (a folder from
disk or a `.zip`, mirroring the whole tree).

![Documents](screens/02-documents.png)

### Graph — the knowledge graph
Documents linked through internal Markdown references, with backlinks and
broken-link highlighting. Filter by linked / stale / broken / orphan.

![Graph](screens/03-graph.png)

### Reader — rich Markdown
Syntax-highlighted code, rendered **Mermaid** diagrams, reading time, tags,
copy/raw toggle, an "on this page" outline, and per-user **Favorite**.

![Reader](screens/04-reader.png)

### Media — pluggable storage volumes
Local / S3 / FTP / SFTP behind one VFS. Encrypted credentials, connection
tests, broken-asset detection, and moving assets between volumes.

![Media](screens/05-media.png)

### Connect — Git source & publishing
Index a GitHub repository (public, or private with an encrypted token),
real-time webhooks, bidirectional auto-sync, and one-click **Publish to Git**.

![Connect](screens/06-connect.png)

---

## Highlights to try in the demo

- **Health & graph wedge** — open a doc, break a link, watch the Graph and
  dashboard flag it; use **Auto-fix all** on the broken-links report.
- **Collaboration** — watch a document, `@mention` a teammate in a review
  comment, and see in-app + email notifications (Mailpit at
  http://localhost:8025) with an opt-in daily digest.
- **Import/export** — import a folder or `.zip` of Markdown, then download the
  whole workspace as a static site or raw-source ZIP.
- **Audit** (as Owner) — every access/admin and document-level action is logged
  at **Team → Audit log**.

See the top-level [README](../../Readme.md) and [ROADMAP](../../ROADMAP.md) for
the full feature list and what's next.
