# Contributing — DocuGraph Backend

## Setup

```bash
npm install
cp .env.example .env          # set JWT_SECRET (long random); MEDIA_SECRET for prod
docker compose up -d          # MongoDB (or point MONGO_URI at your own)
npm run start:dev
```

Health check: `curl http://localhost:3000/api/v1/health` · API docs: `/api/docs`.

## Before a pull request

- `npm run lint` must pass with **0 warnings**.
- `npm test` and `npm run test:e2e` must pass. Add/adjust tests for any behavior
  change — e2e suites cover auth, RBAC, tenant isolation, documents, media,
  webhooks, publish and password reset.
- Keep commits focused; Conventional Commits style (`feat`, `fix`, `docs`).
- Never commit secrets; update `.env.example` when adding a config variable.

## Security

Read [`SECURITY.md`](./SECURITY.md) before deploying publicly. Report
vulnerabilities privately — do not open a public issue.

Contributions are licensed under the project's [MIT License](./LICENSE).
