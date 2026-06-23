# Contributing — DocuGraph Frontend

## Setup

```bash
npm install
cp .env.local.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
npm run dev -- -p 3001
```

A running backend is required (see the backend repository, or the demo stack's
`docker-compose.yml`).

## Before a pull request

- `npx tsc --noEmit` must pass (TypeScript is `strict`).
- Follow the existing design system — theme via CSS variables (Light / Grey /
  Violet), shared primitives in `components/ui`.
- Keep commits focused; Conventional Commits style (`feat`, `fix`, `docs`).
- Never commit secrets; update `.env.local.example` when adding a public var.

## Security

For vulnerabilities, see [`SECURITY.md`](./SECURITY.md) — do not open a public
issue.

Contributions are licensed under the project's [PolyForm Noncommercial License](./LICENSE).
