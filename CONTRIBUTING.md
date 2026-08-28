# Contributing to DocuGraph

Thanks for your interest! This is a monorepo: the NestJS API lives in
`backend/` and the Next.js app in `frontend/`, with self-hosted and demo Compose
stacks at the root.

## Development setup

```bash
docker compose -f docker-compose.demo.yml up -d --build
```

- Frontend: http://localhost:3002 · same-origin API: http://localhost:3002/api/v1
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
