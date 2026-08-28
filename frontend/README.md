# DocuGraph — Frontend

Next.js 14 (App Router) + TypeScript (strict) + Tailwind CSS frontend for
**DocuGraph**, a developer documentation SaaS. Talks to the
[backend](../backend) over REST at `/api/v1`.

## Quick start

Requires Node.js **20.19 or newer**.

```bash
npm install
cp .env.local.example .env.local     # optional native-dev API override
npm run dev -- -p 3001               # backend uses :3000, so run the front elsewhere
```

Container deployments need no build-time public URL: the browser uses
same-origin `/api/v1`, and `DOCUGRAPH_API_UPSTREAM` configures the private
backend URL at runtime. For the auto-seeded demo use `docker-compose.demo.yml`
in the repository root.

## Features

- **Auth** — email/password + GitHub & Slack OAuth; password reset
  (`/forgot-password`, `/reset-password`).
- **Dashboard** — health summary (stale / broken / orphan), activity, watching.
- **Documents** — list with filters, **Reader** (rendered Markdown, TOC,
  related docs / backlinks) and a split-pane **Editor** (Markdown ↔ preview,
  metadata, history). New documents can start from built-in or reusable
  workspace templates; Owner/Editor can manage custom templates in the same
  form. The editor also inserts built-in or workspace Markdown snippets at the
  current selection and lets Owner/Editor manage the reusable library. A
  zero-setup frontmatter schema and tenant-scoped custom schemas generate
  labelled controls for `text`, `number`, `boolean`, `date`, `select`, and
  `list` fields. Applying a schema updates supported fields in the browser while
  preserving unmanaged YAML and the Markdown body. Template, snippet, and
  schema output remains editable and persists only through the normal Save
  action.
- **Structure builder** — drag-and-drop folder / sidebar organization.
- **Graph** — interactive link graph with broken-link detection.
- **Search** — full-text with faceting + a `⌘K` command palette.
- **Media** — file manager over pluggable storage volumes (local / S3 / FTP),
  upload, move between volumes, Markdown embeds.
- **Statistics** — reads, edits over time, contributors, and watchers for every
  member. Owners and Editors also get 7/30/90-day content insights: most-read
  documents, established pages with no reads, and normalized searches that
  returned no visible results. Insight requests are cancelled when the range
  changes and fail independently from the existing statistics dashboard.
- **Connect** — link a Git source, signed webhooks, publish to Git.
- **Team** — members & roles, CI/CD tokens. **Account** — profile & settings.
- Three-theme design system (Light / Grey / Violet).

## Stack

Next.js 14 · React 18 · TypeScript (strict) · Tailwind CSS · Jest + RTL.

## Content analytics

The Statistics page calls the protected
`GET /workspaces/:id/documents/content-analytics?days=7|30|90` endpoint only for
workspace Owners and Editors. The backend applies the caller's per-resource
access rules before returning file paths or read totals. Search telemetry is
privacy-bounded: only zero-result terms are stored, normalized to lowercase
with collapsed whitespace and limited to 160 characters. Successful searches,
user ids, IP addresses, user agents, URLs, and result contents are not tracked.
No third-party analytics service is required.

## License

[PolyForm Noncommercial](./LICENSE)
