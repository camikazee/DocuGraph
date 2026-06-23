# DocuGraph — Frontend

Next.js 14 (App Router) + TypeScript (strict) + Tailwind CSS frontend for
**DocuGraph**, a developer documentation SaaS. Talks to the
[backend](../backend) over REST at `/api/v1`.

## Quick start

```bash
npm install
cp .env.local.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
npm run dev -- -p 3001               # backend uses :3000, so run the front elsewhere
```

For the full stack (backend + Mongo + Mailpit) plus demo data, use the
`docker-compose.yml` and seed in the repository root — see its README.

## Features

- **Auth** — email/password + GitHub & Slack OAuth; password reset
  (`/forgot-password`, `/reset-password`).
- **Dashboard** — health summary (stale / broken / orphan), activity, watching.
- **Documents** — list with filters, **Reader** (rendered Markdown, TOC,
  related docs / backlinks) and a split-pane **Editor** (Markdown ↔ preview,
  metadata, history).
- **Structure builder** — drag-and-drop folder / sidebar organization.
- **Graph** — interactive link graph with broken-link detection.
- **Search** — full-text with faceting + a `⌘K` command palette.
- **Media** — file manager over pluggable storage volumes (local / S3 / FTP),
  upload, move between volumes, Markdown embeds.
- **Statistics** — reads, edits over time, contributors, watchers.
- **Connect** — link a Git source, signed webhooks, publish to Git.
- **Team** — members & roles, CI/CD tokens. **Account** — profile & settings.
- Three-theme design system (Light / Grey / Violet).

## Stack

Next.js 14 · React 18 · TypeScript (strict) · Tailwind CSS · Jest + RTL.

## License

[PolyForm Noncommercial](./LICENSE)
