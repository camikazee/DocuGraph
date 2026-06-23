# Deploying DocuGraph

The `docker-compose.yml` in this repo is a **dev/demo** stack (inline secrets,
no TLS). For a real deployment, follow the steps below.

## 1. Secrets & environment

Never commit secrets — provide them via your orchestrator / secrets manager.
Generate strong values:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_SECRET / MEDIA_SECRET
```

Backend (`backend/.env.example` lists everything). Minimum for production:

| Variable | Notes |
| --- | --- |
| `NODE_ENV=production` | enables prod behavior |
| `MONGO_URI` | your MongoDB (auth + TLS recommended) |
| `JWT_SECRET` | long, random, unique |
| `MEDIA_SECRET` | **separate** key encrypting volume creds + Git push remotes |
| `CORS_ORIGINS` | exact frontend origin(s), **not** `*` |
| `APP_URL` | public frontend URL (used in reset emails) |
| `SMTP_HOST/PORT/USER/PASS/FROM` | real SMTP for password-reset email |
| `SWAGGER_ENABLED` | leave unset/`false` to disable `/api/docs` in prod |
| `THROTTLE_*`, `BCRYPT_ROUNDS` | tune rate limiting / hashing cost |

Frontend build arg `NEXT_PUBLIC_API_URL` must point at the **public** API URL.

## 2. Hardening checklist

- [ ] `NODE_ENV=production`, real `JWT_SECRET` + `MEDIA_SECRET` (not the compose defaults).
- [ ] `CORS_ORIGINS` set to your domain(s).
- [ ] `/api/docs` (Swagger) disabled — it is off in prod unless `SWAGGER_ENABLED=true`.
- [ ] TLS terminated at a reverse proxy (below); never expose Mongo to the internet.
- [ ] Persistent volumes for Mongo data and the workspace `.md` files.
- [ ] Real SMTP configured (Mailpit is dev-only).
- [ ] Backups for the Mongo volume + the workspace storage volume.

## 3. Reverse proxy + HTTPS

Terminate TLS in front of the frontend and API. Example with Caddy
(automatic HTTPS):

```caddyfile
docs.example.com {            # frontend
    reverse_proxy frontend:3000
}
api.example.com {             # backend API
    reverse_proxy backend:3000
}
```

Set `NEXT_PUBLIC_API_URL=https://api.example.com/api/v1`,
`CORS_ORIGINS=https://docs.example.com`, `APP_URL=https://docs.example.com`.

## 4. Persistent storage

Keep these on durable volumes (the compose file already declares named volumes
for dev):

- MongoDB data (`/data/db`).
- Workspace `.md` files — `WORKSPACE_ROOT` (default `/data/workspaces`); this is
  the on-disk source of truth alongside the Mongo index.

## 5. Connect your documentation repo

In the app: **Connect** → enter `owner/repo` + branch → *Start indexing*. For a
public repo that's all. For private repos / push-back, set a write-scoped token
as the push remote (Connect → Publish to Git) — see backend `SECURITY.md`.

## 6. Fail CI on broken docs

Gate your pipeline on documentation health (works with a `dg_live_…` token):

```bash
WS=$(curl -fsS "$API/ci/whoami" -H "Authorization: Bearer $DG_TOKEN" | jq -r .workspaceId)
curl -fsS "$API/workspaces/$WS/documents/health" -H "Authorization: Bearer $DG_TOKEN" \
  | jq -e '.ok' >/dev/null || { echo "Broken documentation links — failing build"; exit 1; }
```
