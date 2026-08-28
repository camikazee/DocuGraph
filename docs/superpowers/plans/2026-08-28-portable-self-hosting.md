# Portable Self-Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one DocuGraph build installable behind any domain, IP address, reverse proxy, NAS, VPS, Portainer, or container platform without rebuilding the frontend for each public API URL.

**Architecture:** Keep the existing Next.js frontend, NestJS REST API, MongoDB, filesystem Markdown storage, and separate frontend/backend images. The browser uses same-origin `/api/v1`; a small Next.js route handler forwards requests to a runtime-configured backend URL on the private container network. A canonical Compose stack, safe environment generator, diagnostics, and public multi-architecture images provide the easy path while preserving source builds and advanced separate-host deployments.

**Tech Stack:** Bash, Docker Compose v2, Docker Buildx, GitHub Actions, Next.js 14 route handlers, TypeScript, Jest, NestJS 10, MongoDB 7.

## Global Constraints

- Preserve Next.js + NestJS + MongoDB + filesystem Markdown storage.
- Preserve separately deployable frontend and backend images.
- Do not add a mandatory proxy, queue, database, cache, or hosted service.
- The default browser/API path is one public origin and one published frontend port.
- MongoDB and the backend remain private by default; advanced operators may publish the backend explicitly.
- The same frontend image must run unchanged under different domains and ports.
- Installation must not overwrite an existing `.env` or silently replace persistent volumes.
- Product/UI copy and public documentation remain English.
- Images must support `linux/amd64` and `linux/arm64`.
- Keep demo seeding isolated in `docker-compose.demo.yml`; production quick start must not create demo users.

---

### Task 1: Runtime same-origin API gateway

**Files:**
- Create: `frontend/lib/api-proxy.ts`
- Create: `frontend/lib/api-proxy.test.ts`
- Create: `frontend/app/api/v1/[...path]/route.ts`
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/lib/api.test.ts`
- Modify: `frontend/Dockerfile`
- Modify: `frontend/SECURITY.md`

**Interfaces:**
- Consumes: `DOCUGRAPH_API_UPSTREAM`, a runtime URL ending in `/api/v1` and reachable by the frontend server.
- Produces: `proxyApiRequest(request: Request, path: string[]): Promise<Response>` and same-origin browser base `/api/v1`.
- Guarantees: method, query, request body, authorization, content type, status, response body, and safe end-to-end headers survive the proxy; hop-by-hop headers and browser cookies do not cross the boundary.

- [ ] **Step 1: Write failing proxy tests**

Create `frontend/lib/api-proxy.test.ts` with cases for JSON POST, multipart bytes, query strings, binary responses, backend errors, HEAD requests, and invalid upstream configuration. The first test must assert the exact runtime URL and header boundary:

```ts
import { proxyApiRequest } from './api-proxy';

describe('runtime API proxy', () => {
  beforeEach(() => {
    process.env.DOCUGRAPH_API_UPSTREAM = 'http://backend:3000/api/v1';
    global.fetch = jest.fn();
  });

  it('forwards a JSON request to the runtime upstream', async () => {
    jest.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
      }),
    );
    const request = new Request('https://docs.example.com/api/v1/documents?limit=20', {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
        cookie: 'must-not-leak=true',
      },
      body: JSON.stringify({ title: 'Guide' }),
    });

    const response = await proxyApiRequest(request, ['documents']);

    expect(fetch).toHaveBeenCalledWith(
      'http://backend:3000/api/v1/documents?limit=20',
      expect.objectContaining({ method: 'POST', redirect: 'manual' }),
    );
    const init = jest.mocked(fetch).mock.calls[0][1];
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer token');
    expect(headers.get('cookie')).toBeNull();
    expect(response.status).toBe(201);
    expect(response.headers.get('x-request-id')).toBe('req-1');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd frontend && npm test -- --runInBand lib/api-proxy.test.ts`

Expected: FAIL because `frontend/lib/api-proxy.ts` does not exist.

- [ ] **Step 3: Implement the bounded runtime proxy**

Create `frontend/lib/api-proxy.ts` with a fixed environment-owned upstream and explicit request header allowlist:

```ts
const REQUEST_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'if-match',
  'if-none-match',
  'x-request-id',
] as const;

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function upstreamBase(): URL {
  const value = process.env.DOCUGRAPH_API_UPSTREAM ?? 'http://localhost:3000/api/v1';
  const url = new URL(value.endsWith('/') ? value : `${value}/`);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('DOCUGRAPH_API_UPSTREAM must use http or https');
  }
  return url;
}

export async function proxyApiRequest(
  request: Request,
  path: string[],
): Promise<Response> {
  const source = new URL(request.url);
  const target = upstreamBase();
  target.pathname = `${target.pathname.replace(/\/$/, '')}/${path
    .map(encodeURIComponent)
    .join('/')}`;
  target.search = source.search;

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
    signal: request.signal,
  });
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!HOP_BY_HOP.has(name.toLowerCase())) responseHeaders.append(name, value);
  });
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
```

- [ ] **Step 4: Expose every supported HTTP method through one route handler**

Create `frontend/app/api/v1/[...path]/route.ts`:

```ts
import { proxyApiRequest } from '@/lib/api-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: { path: string[] } };
const handle = (request: Request, context: Context) =>
  proxyApiRequest(request, context.params.path);

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
```

- [ ] **Step 5: Make the browser default same-origin and remove the build-time Docker argument**

Change `frontend/lib/api.ts` to:

```ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';
```

Keep `NEXT_PUBLIC_API_URL` as an optional native-development escape hatch, but remove `ARG NEXT_PUBLIC_API_URL` and its `ENV` assignment from the Docker builder. Add `ENV DOCUGRAPH_API_UPSTREAM=http://backend:3000/api/v1` to the production runtime stage.

Extend `frontend/lib/api.test.ts` to assert `fetch` receives `/api/v1/test` when no public override is compiled. Update `frontend/SECURITY.md` to state that the proxy forwards only Bearer auth and bounded headers, does not forward browser cookies, and accepts no user-controlled upstream.

- [ ] **Step 6: Run frontend verification**

Run: `cd frontend && npm run lint && npm run typecheck && npm test -- --runInBand && npm run build`

Expected: PASS; the build route list includes `/api/v1/[...path]`.

- [ ] **Step 7: Commit the runtime boundary**

```bash
git add frontend/app/api frontend/lib/api-proxy.ts frontend/lib/api-proxy.test.ts frontend/lib/api.ts frontend/lib/api.test.ts frontend/Dockerfile frontend/SECURITY.md
git commit -m "feat(install): configure API upstream at runtime"
```

---

### Task 2: Canonical safe Compose installation

**Files:**
- Create: `.env.example`
- Modify: `.gitignore`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.prod.yml`
- Modify: `docker-compose.portainer.yml`
- Modify: `.env.portainer.example`
- Modify: `docker-compose.demo.yml`

**Interfaces:**
- Consumes: `APP_URL`, `JWT_SECRET`, `MEDIA_SECRET`, `DOCUGRAPH_PORT`, optional image registry/tag, SMTP, OAuth, and rate-limit variables.
- Produces: one public frontend endpoint; internal `frontend -> backend -> mongo` networking; persistent `mongo-data` and `workspace-data` volumes.
- Defaults: `DOCUGRAPH_PORT=3002`, `APP_URL=http://localhost:3002`, `DOCUGRAPH_REGISTRY=ghcr.io/camikazee`, `DOCUGRAPH_TAG=latest`.

- [ ] **Step 1: Write a Compose contract test**

Create `scripts/compose-contract.test.sh`. It must copy `.env.example` to a temporary env file, inject deterministic test secrets, render every Compose file with `docker compose config`, and assert:

```bash
#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
sed \
  -e 's/^JWT_SECRET=$/JWT_SECRET=0123456789abcdef0123456789abcdef/' \
  -e 's/^MEDIA_SECRET=$/MEDIA_SECRET=fedcba9876543210fedcba9876543210/' \
  "$root/.env.example" > "$tmp/docugraph.env"

docker compose --env-file "$tmp/docugraph.env" -f "$root/docker-compose.yml" config --quiet
docker compose --env-file "$tmp/docugraph.env" -f "$root/docker-compose.prod.yml" config --quiet
rendered="$(docker compose --env-file "$tmp/docugraph.env" -f "$root/docker-compose.yml" config)"
test "$(grep -c 'published: "3002"' <<<"$rendered")" -eq 1
grep -q 'DOCUGRAPH_API_UPSTREAM: http://backend:3000/api/v1' <<<"$rendered"
! grep -q 'published: "27017"' <<<"$rendered"
```

- [ ] **Step 2: Run the contract and verify it fails**

Run: `bash scripts/compose-contract.test.sh`

Expected: FAIL because `.env.example` and the one-origin Compose contract do not exist.

- [ ] **Step 3: Add the root environment template**

Create `.env.example` with empty secrets and usable non-secret defaults:

```dotenv
DOCUGRAPH_PORT=3002
APP_URL=http://localhost:3002
DOCUGRAPH_REGISTRY=ghcr.io/camikazee
DOCUGRAPH_TAG=latest
JWT_SECRET=
MEDIA_SECRET=
JWT_EXPIRES_IN=1d
SWAGGER_ENABLED=false
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=DocuGraph <no-reply@docugraph.local>
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_CALLBACK_URL=
THROTTLE_TTL_MS=60000
THROTTLE_LIMIT=100
AUTH_THROTTLE_TTL_MS=60000
AUTH_THROTTLE_LIMIT=10
```

Ensure root `.env` is ignored while `.env.example` remains tracked.

- [ ] **Step 4: Make the root stack secure and source-buildable**

Update `docker-compose.yml` so backend and frontend declare both a public image and their existing `build` blocks. Require secrets with Compose interpolation:

```yaml
backend:
  image: ${DOCUGRAPH_REGISTRY:-ghcr.io/camikazee}/docugraph-backend:${DOCUGRAPH_TAG:-latest}
  build:
    context: ./backend
    target: prod
  environment:
    NODE_ENV: production
    MONGO_URI: mongodb://mongo:27017/docugraph
    JWT_SECRET: ${JWT_SECRET:?Run ./scripts/install.sh to generate .env}
    MEDIA_SECRET: ${MEDIA_SECRET:?Run ./scripts/install.sh to generate .env}
    APP_URL: ${APP_URL:-http://localhost:3002}
    CORS_ORIGINS: ${APP_URL:-http://localhost:3002}
  expose: ['3000']

frontend:
  image: ${DOCUGRAPH_REGISTRY:-ghcr.io/camikazee}/docugraph-frontend:${DOCUGRAPH_TAG:-latest}
  build:
    context: ./frontend
    target: prod
  environment:
    DOCUGRAPH_API_UPSTREAM: http://backend:3000/api/v1
  ports:
    - '${DOCUGRAPH_PORT:-3002}:3000'
```

Remove inline development secrets, the backend host port, and default Mailpit from the canonical production-safe stack. Preserve named volumes and health-gated startup. Add a frontend healthcheck using Node `fetch('http://localhost:3000')`.

- [ ] **Step 5: Align prebuilt, Portainer, and demo variants**

For `docker-compose.prod.yml`, use the same image defaults, one frontend port, runtime upstream, and no frontend build argument. For Portainer keep source builds but replace `NEXT_PUBLIC_API_URL` with runtime `DOCUGRAPH_API_UPSTREAM`. Keep demo ports and Mailpit, but make its frontend call the internal runtime upstream instead of baking a host URL.

Update `.env.portainer.example` so the only required public URL is `APP_URL`; remove `NEXT_PUBLIC_API_URL`, explain the single-origin `/api/v1` gateway, and retain optional OAuth callback examples under the same origin.

- [ ] **Step 6: Verify all Compose variants**

Run: `bash scripts/compose-contract.test.sh`

Expected: PASS.

Run: `docker compose --env-file .env.example -f docker-compose.demo.yml config --quiet`

Expected: PASS without publishing MongoDB.

- [ ] **Step 7: Commit the deployment contract**

```bash
git add .env.example .gitignore docker-compose.yml docker-compose.prod.yml docker-compose.portainer.yml docker-compose.demo.yml .env.portainer.example scripts/compose-contract.test.sh
git commit -m "feat(install): add portable one-origin stack"
```

---

### Task 3: Idempotent installer and environment doctor

**Files:**
- Create: `scripts/install.sh`
- Create: `scripts/install.test.sh`
- Create: `scripts/doctor.sh`
- Create: `scripts/doctor.test.sh`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- `./scripts/install.sh [--build] [--no-start] [--url URL]` creates `.env` only when absent, validates Compose, starts the stack, and invokes the doctor.
- `./scripts/doctor.sh [--config-only]` exits non-zero with actionable messages when Docker, Compose configuration, containers, or internal health checks fail.
- `DOCUGRAPH_ROOT` is a test-only repository-root override; production behavior resolves the script parent directory.

- [ ] **Step 1: Write installer failure and idempotency tests**

Create `scripts/install.test.sh` with a temporary project copy and a fake `docker` executable. Cover all of these assertions:

```bash
# First --no-start run creates two different 96-character lowercase hex secrets.
DOCUGRAPH_ROOT="$fixture" "$fixture/scripts/install.sh" --no-start --url https://docs.example.com
grep -Eq '^JWT_SECRET=[0-9a-f]{96}$' "$fixture/.env"
grep -Eq '^MEDIA_SECRET=[0-9a-f]{96}$' "$fixture/.env"
test "$(sed -n 's/^APP_URL=//p' "$fixture/.env")" = 'https://docs.example.com'
test "$(sed -n 's/^JWT_SECRET=//p' "$fixture/.env")" != \
  "$(sed -n 's/^MEDIA_SECRET=//p' "$fixture/.env")"

# A second run preserves the file byte-for-byte.
cp "$fixture/.env" "$fixture/original.env"
DOCUGRAPH_ROOT="$fixture" "$fixture/scripts/install.sh" --no-start
cmp "$fixture/.env" "$fixture/original.env"

# An invalid URL and missing Docker both fail with a readable message.
```

- [ ] **Step 2: Run the installer test and verify it fails**

Run: `bash scripts/install.test.sh`

Expected: FAIL because `scripts/install.sh` does not exist.

- [ ] **Step 3: Implement the non-destructive installer**

The installer must use `set -euo pipefail`, parse only the documented flags, validate `APP_URL` as an exact `http://` or `https://` origin (no path, query, fragment, whitespace, `&`, or `|`), require `docker compose version`, and generate secrets with `/dev/urandom`, `od`, and `tr`. It must never source `.env` as shell code. Generate `.env` by transforming only exact keys from `.env.example`:

```bash
generate_secret() {
  od -An -N48 -tx1 /dev/urandom | tr -d ' \n'
}

if [[ ! -e "$root/.env" ]]; then
  jwt_secret="$(generate_secret)"
  media_secret="$(generate_secret)"
  sed \
    -e "s|^APP_URL=.*$|APP_URL=$app_url|" \
    -e "s|^JWT_SECRET=.*$|JWT_SECRET=$jwt_secret|" \
    -e "s|^MEDIA_SECRET=.*$|MEDIA_SECRET=$media_secret|" \
    "$root/.env.example" > "$root/.env"
  chmod 600 "$root/.env"
fi

docker compose --env-file "$root/.env" -f "$root/docker-compose.yml" config --quiet
```

Without `--no-start`, run `docker compose up -d` for published images or `docker compose up -d --build` when `--build` is supplied, then call `scripts/doctor.sh`. Print the frontend URL and backup reminder on success.

- [ ] **Step 4: Write and run failing doctor tests**

Create `scripts/doctor.test.sh` with a fake Docker executable that records arguments and returns controlled exit codes. Assert `--config-only` calls `docker compose ... config --quiet`, a stopped service produces non-zero status, and healthy frontend/backend probes produce:

```text
OK  Compose configuration
OK  MongoDB
OK  Backend readiness
OK  Frontend
```

Run: `bash scripts/doctor.test.sh`

Expected: FAIL because `scripts/doctor.sh` does not exist.

- [ ] **Step 5: Implement diagnostics without host curl dependencies**

Use Docker-contained probes so the host needs only Docker Compose:

```bash
docker compose --env-file "$root/.env" -f "$root/docker-compose.yml" config --quiet
docker compose --env-file "$root/.env" -f "$root/docker-compose.yml" exec -T backend \
  node -e "fetch('http://localhost:3000/api/v1/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
docker compose --env-file "$root/.env" -f "$root/docker-compose.yml" exec -T frontend \
  node -e "fetch('http://localhost:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

Check MongoDB via `docker compose exec -T mongo mongosh --quiet --eval 'quit(db.runCommand({ ping: 1 }).ok ? 0 : 1)'`. Emit one `OK` or `FAIL` line per boundary and return non-zero if any required check fails.

- [ ] **Step 6: Gate installation contracts in CI**

Add a root-level CI step after checkout:

```yaml
- name: Validate portable installation
  run: |
    bash scripts/compose-contract.test.sh
    bash scripts/install.test.sh
    bash scripts/doctor.test.sh
```

Run: `bash scripts/install.test.sh && bash scripts/doctor.test.sh && bash scripts/compose-contract.test.sh`

Expected: PASS.

- [ ] **Step 7: Commit installer and diagnostics**

```bash
git add scripts/install.sh scripts/install.test.sh scripts/doctor.sh scripts/doctor.test.sh .github/workflows/ci.yml
git commit -m "feat(install): add safe setup and diagnostics"
```

---

### Task 4: Public multi-architecture release images

**Files:**
- Create: `.github/workflows/images.yml`
- Modify: `Jenkinsfile`
- Modify: `docker-compose.prod.yml`

**Interfaces:**
- Produces: `ghcr.io/camikazee/docugraph-backend` and `ghcr.io/camikazee/docugraph-frontend` for `linux/amd64` and `linux/arm64`.
- Tags: `latest` from `main`, branch name for manual/main builds, semantic versions from `v*` tags, and immutable `sha-<commit>`.
- Requires only the standard GitHub `GITHUB_TOKEN` with `packages: write`; no project secret is added.

- [ ] **Step 1: Add a static workflow contract test**

Extend `scripts/validate-project-docs.test.sh` to assert:

```bash
workflow="$root/.github/workflows/images.yml"
test -s "$workflow"
grep -q 'linux/amd64,linux/arm64' "$workflow"
grep -q 'packages: write' "$workflow"
grep -q 'ghcr.io/camikazee/docugraph-backend' "$root/docker-compose.prod.yml"
grep -q 'DOCUGRAPH_API_UPSTREAM' "$root/docker-compose.prod.yml"
! grep -q 'NEXT_PUBLIC_API_URL' "$root/Jenkinsfile"
```

- [ ] **Step 2: Run the validator and verify it fails**

Run: `bash scripts/validate-project-docs.test.sh`

Expected: FAIL because the image publishing workflow does not exist and Jenkins still builds a per-environment frontend.

- [ ] **Step 3: Publish backend and frontend with Buildx**

Create `.github/workflows/images.yml` triggered on `main`, `v*` tags, and `workflow_dispatch`. Set:

```yaml
permissions:
  contents: read
  packages: write

env:
  REGISTRY: ghcr.io
  BACKEND_IMAGE: ghcr.io/camikazee/docugraph-backend
  FRONTEND_IMAGE: ghcr.io/camikazee/docugraph-frontend
```

Use `docker/setup-qemu-action@v3`, `docker/setup-buildx-action@v3`, `docker/login-action@v3`, `docker/metadata-action@v5`, and `docker/build-push-action@v6`. Each build must use `platforms: linux/amd64,linux/arm64`, `push: true`, GitHub Actions cache, the relevant Dockerfile context, and `target: prod`. Metadata tags must include:

```yaml
tags: |
  type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
  type=ref,event=branch
  type=semver,pattern={{version}}
  type=semver,pattern={{major}}.{{minor}}
  type=sha
```

- [ ] **Step 4: Remove per-environment frontend builds from Jenkins**

Delete the `NEXT_PUBLIC_API_URL` parameter and build argument. Build the frontend with `--target prod ./frontend`, because its backend upstream is now runtime configuration. Update Jenkins comments and success output to describe environment-agnostic images.

- [ ] **Step 5: Validate workflow and image references**

Run:

```bash
bash scripts/validate-project-docs.test.sh
JWT_SECRET=0123456789abcdef0123456789abcdef \
MEDIA_SECRET=fedcba9876543210fedcba9876543210 \
  docker compose --env-file .env.example -f docker-compose.prod.yml config --quiet
```

Expected: PASS.

- [ ] **Step 6: Commit image portability**

```bash
git add .github/workflows/images.yml Jenkinsfile docker-compose.prod.yml scripts/validate-project-docs.test.sh
git commit -m "ci(images): publish portable multi-arch releases"
```

---

### Task 5: Installation documentation and end-to-end acceptance

**Files:**
- Modify: `Readme.md`
- Modify: `DEPLOY.md`
- Modify: `CONTRIBUTING.md`
- Modify: `frontend/README.md`
- Modify: `frontend/CONTRIBUTING.md`
- Modify: `frontend/.env.local.example`
- Modify: `docs/demo/README.md`
- Modify: `docs/engineering/architecture.md`
- Modify: `docs/engineering/change-log.md`
- Modify: `ROADMAP.md`
- Create: `docs/install/containers.md`

**Interfaces:**
- Produces three documented paths: quickest prebuilt install, source build, and orchestrator deployment.
- Defines one runtime contract shared by Docker Compose, Portainer, Kubernetes, Nomad, and managed container platforms: frontend public URL, `DOCUGRAPH_API_UPSTREAM`, backend secrets/config, Mongo URI, and two persistent mounts.

- [ ] **Step 1: Replace the root quick start with safe one-command installation**

Document these exact paths in `Readme.md`:

```bash
git clone https://github.com/camikazee/DocuGraph.git
cd DocuGraph
./scripts/install.sh
```

Source build:

```bash
./scripts/install.sh --build
```

Custom public address without editing YAML:

```bash
./scripts/install.sh --url https://docs.example.com
```

State that `.env` is created once with mode `0600`, existing configuration and volumes are preserved, only the frontend port is public, and `./scripts/doctor.sh` diagnoses the installation. Keep the separate demo command and demo credentials clearly labeled as non-production.

- [ ] **Step 2: Document platform-neutral container deployment**

Create `docs/install/containers.md` with:

- a topology diagram `browser -> frontend:3000 -> backend:3000 -> mongo:27017`;
- exact required backend environment: `MONGO_URI`, `JWT_SECRET`, `MEDIA_SECRET`, `APP_URL`, `WORKSPACE_ROOT=/data/workspaces`;
- exact frontend runtime environment: `DOCUGRAPH_API_UPSTREAM=http://backend:3000/api/v1`;
- persistent mounts `/data/db` and `/data/workspaces`;
- liveness `/api/v1/health` and readiness `/api/v1/ready` through the frontend origin;
- reverse-proxy examples for Caddy, Nginx, and Traefik that expose only `frontend:3000`;
- Portainer instructions using the existing Compose file;
- Kubernetes/Nomad guidance expressed as the runtime contract, not a mandatory chart or operator;
- amd64/arm64 image names and immutable version pinning;
- upgrades, rollbacks, backups, and the rule that `MEDIA_SECRET` must remain stable.

- [ ] **Step 3: Remove stale two-domain and build-time instructions**

Update `DEPLOY.md`, frontend docs, `.env.local.example`, demo docs, and `CONTRIBUTING.md`. Same-origin is the default. Keep `NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1` only as an optional native frontend-development override; never require it in a container build.

- [ ] **Step 4: Record the shipped capability**

Add to `ROADMAP.md` under Platform:

```markdown
- [x] **Portable self-hosting** — one safe installer and one-origin Compose
  topology run the same amd64/arm64 frontend and backend images under any
  domain without rebuilding; runtime diagnostics cover config, Mongo, API
  readiness, and frontend health.
```

Remove the provider-specific interpretation of “Optional live/preview”; retain a hosted showcase only as an optional community-operated instance, not a product installation requirement. Record the runtime API gateway, installer behavior, multi-architecture images, and unchanged architecture in `docs/engineering/change-log.md` and `docs/engineering/architecture.md`.

- [ ] **Step 5: Run all local quality gates**

Run:

```bash
./scripts/validate-project-docs.sh
bash scripts/validate-project-docs.test.sh
bash scripts/compose-contract.test.sh
bash scripts/install.test.sh
bash scripts/doctor.test.sh
cd frontend
npm run lint
npm run typecheck
npm test -- --runInBand
npm run build
```

Expected: every command PASS.

Run the source-built acceptance stack with generated temporary configuration:

```bash
./scripts/install.sh --build
./scripts/doctor.sh
```

Expected: MongoDB, backend readiness, frontend, and same-origin `http://localhost:3002/api/v1/health` all report healthy. Do not remove volumes during acceptance.

- [ ] **Step 6: Commit documentation and acceptance**

```bash
git add Readme.md DEPLOY.md CONTRIBUTING.md frontend/README.md frontend/CONTRIBUTING.md frontend/.env.local.example docs/demo/README.md docs/install/containers.md docs/engineering/architecture.md docs/engineering/change-log.md ROADMAP.md
git commit -m "docs(install): document portable self-hosting"
```

---

## Final acceptance criteria

- A fresh clone starts with `./scripts/install.sh` and no manual secret generation.
- The installer never overwrites `.env` and never deletes or recreates volumes intentionally.
- Changing `APP_URL` does not require rebuilding either image.
- Only the frontend port is published by default.
- Browser API, uploads, downloads, OAuth callbacks, and error responses work through `/api/v1`.
- `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.portainer.yml`, and `docker-compose.demo.yml` all validate.
- Public images are produced for amd64 and arm64 from one source revision.
- Operators can diagnose configuration, database, backend readiness, and frontend health with one command.
- The documentation explains Compose, source build, Portainer, and the generic container runtime contract without requiring a specific cloud vendor.
- No new mandatory service or architecture layer is introduced.
