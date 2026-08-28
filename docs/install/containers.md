# Portable container installation

DocuGraph does not require a specific cloud, ingress controller, or container
manager. The supported boundary is a small runtime contract that works with
Docker Compose, Portainer, Kubernetes, Nomad, a NAS, or a managed container
platform.

## Topology

```text
browser
  │  http(s)://docs.example.com
  ▼
frontend:3000 (public)
  │  /api/v1 → DOCUGRAPH_API_UPSTREAM
  ▼
backend:3000 (private)
  │
  ▼
mongo:27017 (private)
```

The frontend and backend remain separate images. Next.js serves the UI and
forwards same-origin `/api/v1` traffic to NestJS. The backend URL is read at
container runtime, so changing a domain, port, or private service name never
requires rebuilding the frontend image.

## Fastest installation

Requirements: Docker Engine with the Compose v2 plugin, or Docker Desktop.

```bash
git clone https://github.com/camikazee/DocuGraph.git
cd DocuGraph
./scripts/install.sh
```

The installer creates `.env` once, generates different 384-bit JWT and media
secrets, sets mode `0600`, validates Compose, starts the stack, and runs health
checks. It never overwrites an existing `.env` or removes volumes.

```bash
./scripts/install.sh --url https://docs.example.com # public origin
./scripts/install.sh --build                        # build this checkout
./scripts/install.sh --no-start                     # config only
./scripts/doctor.sh                                 # full diagnosis
```

Without the shell helper, copy `.env.example` to `.env`, set unique
`JWT_SECRET` and `MEDIA_SECRET`, and run:

```bash
docker compose pull
docker compose up -d --no-build
```

Use `docker compose up -d --build` to build from source. Windows users can run
the helper from WSL or Git Bash, or use the manual Compose commands from
PowerShell after creating `.env`.

## Runtime contract

### Frontend

Image: `ghcr.io/camikazee/docugraph-frontend:<version>`

| Variable | Required | Example |
| --- | --- | --- |
| `DOCUGRAPH_API_UPSTREAM` | yes | `http://backend:3000/api/v1` |
| `PORT` | no | `3000` |

Expose frontend port `3000` to the ingress or host. Do not set
`NEXT_PUBLIC_API_URL` in container builds; it is only an optional native
development override.

### Backend

Image: `ghcr.io/camikazee/docugraph-backend:<version>`

| Variable | Required | Example |
| --- | --- | --- |
| `MONGO_URI` | yes | `mongodb://mongo:27017/docugraph` |
| `JWT_SECRET` | yes | unique random value, at least 16 characters |
| `MEDIA_SECRET` | yes | different stable random value |
| `APP_URL` | yes | `https://docs.example.com` |
| `WORKSPACE_ROOT` | yes | `/data/workspaces` |
| `NODE_ENV` | yes | `production` |

SMTP, OAuth, rate-limit, and `*_FILE` secret variables are documented in
[DEPLOY.md](../../DEPLOY.md). Keep `MEDIA_SECRET` stable: it encrypts stored
volume credentials and Git remotes.

### Persistence and probes

Persist both independently:

- MongoDB `/data/db` — users, index, application state, audit and jobs.
- Backend `/data/workspaces` — source-of-truth Markdown and local media.

Probes:

- liveness: `GET /api/v1/health`
- readiness: `GET /api/v1/ready`
- frontend: `GET /login`

The first two are available through the public frontend origin and directly on
the private backend service.

## Reverse proxies

Expose only the frontend. TLS termination belongs to the operator's existing
proxy; DocuGraph does not require another proxy container.

### Caddy

```caddyfile
docs.example.com {
    reverse_proxy frontend:3000
}
```

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name docs.example.com;

    location / {
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_pass http://frontend:3000;
    }
}
```

### Traefik labels

Attach labels only to the frontend service:

```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.docugraph.rule=Host(`docs.example.com`)
  - traefik.http.routers.docugraph.entrypoints=websecure
  - traefik.http.routers.docugraph.tls=true
  - traefik.http.services.docugraph.loadbalancer.server.port=3000
```

## Portainer

1. Create **Stacks → Add stack → Repository**.
2. Select `docker-compose.portainer.yml` and enable build from repository.
3. Paste `.env.portainer.example`, replacing the two secrets and `APP_URL`.
4. Deploy and route your existing reverse proxy to the frontend service.

The stack persists `mongo-data` and `workspace-data`. Pull/redeploy updates the
application without changing configuration or volumes.

## Kubernetes, Nomad, and managed platforms

No DocuGraph-specific operator is required. Translate the runtime contract:

- one frontend Deployment/service with `DOCUGRAPH_API_UPSTREAM`;
- one backend Deployment/service with its environment and workspace volume;
- MongoDB as a StatefulSet or managed service;
- one public ingress/service targeting only the frontend;
- secrets supplied as environment variables or mounted files via `*_FILE`;
- persistent claims for MongoDB and workspace storage.

For horizontal backend scaling, shared filesystem mutation and scheduled work
need an operator-provided single-writer/lease strategy. The supported default
is one backend replica.

## Architectures, versions, and upgrades

Release images support `linux/amd64` and `linux/arm64`. Pin a release in `.env`:

```dotenv
DOCUGRAPH_TAG=1.4.0
```

Upgrade:

```bash
docker compose pull
docker compose up -d --no-build
./scripts/doctor.sh
```

Rollback by restoring the previous `DOCUGRAPH_TAG` and repeating those
commands. Never use `docker compose down -v` during an upgrade.

Before upgrading, back up MongoDB, workspace storage, and `.env` together using
`./scripts/backup.sh`; restore procedures are in [DEPLOY.md](../../DEPLOY.md).
