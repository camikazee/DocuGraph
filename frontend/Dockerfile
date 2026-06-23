# ==============================================================================
# Stage 1: Base — instalacja zależności (z odpornym retry jak w Kidolo)
# ==============================================================================
FROM node:20-alpine AS base
WORKDIR /app

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
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ==============================================================================
# Stage 3: Builder — kompilacja Next.js (artefakt standalone)
# ==============================================================================
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* są wkompilowywane na etapie build (czytane w przeglądarce).
ARG NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY . .
RUN npm run build

# ==============================================================================
# Stage 4: Production (lekki runtime — server.js ze standalone)
# ==============================================================================
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
