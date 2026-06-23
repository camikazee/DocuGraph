# ==============================================================================
# Stage 1: Base — instalacja zależności (z odpornym retry jak w Kidolo)
# ==============================================================================
FROM node:20-bookworm-slim AS base
WORKDIR /app

# git — wymagany przez „Publish to Git" (commit & push przez simple-git).
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm config set registry https://registry.npmjs.org/ \
    && npm config set fetch-retries 5 \
    && npm config set fetch-retry-factor 2 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && for attempt in 1 2 3; do \
        npm ci && break; \
        if [ "$attempt" = "3" ]; then exit 1; fi; \
        npm cache clean --force; \
        sleep 10; \
    done

# ==============================================================================
# Stage 2: Development (hot-reload)
# ==============================================================================
FROM base AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ==============================================================================
# Stage 3: Builder — kompilacja TS + usunięcie zależności dev
# ==============================================================================
FROM base AS builder
COPY . .
RUN npm run build \
    && npm prune --omit=dev

# ==============================================================================
# Stage 4: Production
# ==============================================================================
FROM node:20-bookworm-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# git — wymagany przez „Publish to Git" (commit & push przez simple-git).
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Użytkownik nieuprzywilejowany + katalog na pliki .md (SSoT) z właściwym ownerem.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nestjs \
    && mkdir -p /data/workspaces \
    && chown -R nestjs:nodejs /data/workspaces

COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --chown=nestjs:nodejs package.json ./

USER nestjs
EXPOSE 3000
CMD ["node", "dist/main"]
