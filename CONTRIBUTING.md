# Contributing to DocuGraph

Thanks for your interest! This is a monorepo: the NestJS API lives in
`backend/` and the Next.js app in `frontend/`, with the demo stack
(`docker-compose.yml`) at the root.

## Development setup

```bash
docker compose up -d --build      # mongo + backend + frontend + mailpit
cd backend && npm run seed        # demo data (users, docs, media)
```

- Frontend: http://localhost:3002 · API: http://localhost:3000/api/v1
- Demo login: `owner@demo.docugraph` / `Demo1234!` (see the root README)

Working on a single package instead? Each has its own README and `.env.example`.

## Before opening a pull request

- **Backend:** `npm run lint` (0 warnings), `npm test`, and `npm run test:e2e`
  must pass. Add or update tests for behavior changes.
- **Frontend:** `npx tsc --noEmit` must pass; keep components consistent with
  the existing design system (CSS-variable themes).
- Keep commits focused and write clear messages (Conventional Commits style:
  `feat(...)`, `fix(...)`, `docs(...)`).
- Don't commit secrets. Use `.env` (git-ignored); update `.env.example` when you
  add a config variable.

## Reporting bugs & security issues

Open an issue for bugs. For **security** vulnerabilities, follow
[`SECURITY.md`](./SECURITY.md) — do not file a public issue.

## License

By contributing you agree that your contributions are licensed under the
project's [PolyForm Noncommercial License](./LICENSE).
