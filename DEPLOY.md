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
- [ ] Backups for the Mongo volume + the workspace storage volume — see §7.

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
  the on-disk source of truth alongside the Mongo index. **Local media assets
  live here too**, under `<WORKSPACE_ROOT>/<workspaceId>/.media/…`, so this one
  volume covers both docs and locally-stored uploads.

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

## 7. Backups & restore

Three things must be backed up together — a restore is only useful with all
three:

| What | Where | Why it matters |
| --- | --- | --- |
| **Mongo** (`mongo-data`) | volume `/data/db` | index, users, workspaces, memberships, comments, notifications, audit, **encrypted** volume creds + Git push remotes |
| **Workspace storage** (`workspace-data`) | `WORKSPACE_ROOT` (`/data/workspaces`) | source-of-truth `.md` files **and** local media under `…/.media/` |
| **Secrets** | your env / secret manager | `JWT_SECRET` and `MEDIA_SECRET` — without `MEDIA_SECRET` the encrypted creds/remotes in Mongo are **unrecoverable** |

> The `.md` files are also mirrored to your Git repo if you configured push-back,
> so Git is a second copy of the docs — but **not** of media, secrets, or the
> Mongo-only data (comments, audit, etc.). Don't rely on Git alone.

### Take a backup

Helper script (safe, read-only) — writes timestamped files to `./backups/`:

```bash
./scripts/backup.sh            # mongodump + tar of the workspace volume
```

Under the hood it does the equivalent of:

```bash
# 1) Mongo — logical dump streamed to the host
docker compose exec -T mongo mongodump --archive --gzip --db=docugraph \
  > backups/mongo-<ts>.archive.gz

# 2) Workspace + local media — tar the volume via the backend's mount
docker run --rm --volumes-from "$(docker compose ps -q backend)" \
  -v "$PWD/backups":/backup alpine \
  tar czf /backup/workspace-<ts>.tgz -C /data/workspaces .
```

### Restore

```bash
./scripts/restore.sh backups/mongo-<ts>.archive.gz backups/workspace-<ts>.tgz
```

It restores Mongo with `--drop` and replaces the workspace volume contents,
after an explicit confirmation. Equivalent manual steps:

```bash
# Mongo (drops existing collections first)
docker compose exec -T mongo mongorestore --archive --gzip --drop \
  < backups/mongo-<ts>.archive.gz

# Workspace files + media (wipe then extract)
docker run --rm --volumes-from "$(docker compose ps -q backend)" \
  -v "$PWD/backups":/backup alpine sh -c \
  'rm -rf /data/workspaces/* && tar xzf /backup/workspace-<ts>.tgz -C /data/workspaces'

docker compose restart backend
```

Restore the **same `MEDIA_SECRET`** you had when the data was written, or
re-enter volume credentials and Git remotes afterwards.

### Operational notes

- **Cadence:** at least daily for active workspaces; keep the Mongo and
  workspace archives from the *same run* together.
- **Retention & offsite:** rotate (e.g. 7 daily / 4 weekly) and copy archives to
  storage on a different host/provider — a snapshot next to the server dies with
  it.
- **Managed Mongo (Atlas, etc.):** prefer its point-in-time backups; you then
  only need to back up the workspace volume + secrets.
- **Test your restore.** A backup you have never restored is a hypothesis. Do a
  trial restore into a throwaway stack periodically.
