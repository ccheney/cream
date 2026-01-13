# syntax=docker/dockerfile:1
# Worker (Scheduler) Dockerfile
#
# Multi-stage build for production worker deployment.
# Uses oven/bun as the runtime for improved performance.
#
# Build: docker build -t cream-worker -f apps/worker/Dockerfile .
# Run:   docker run -e CREAM_ENV=PAPER -e TURSO_DATABASE_URL=... cream-worker

# ===========================================
# Stage 1: Dependencies
# ===========================================
FROM oven/bun:1.3 AS deps
WORKDIR /app

# Copy workspace configuration
COPY package.json bun.lock ./

# Copy all package.json files for workspace resolution
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/domain/package.json ./packages/domain/
COPY packages/config/package.json ./packages/config/
COPY packages/storage/package.json ./packages/storage/
COPY packages/metrics/package.json ./packages/metrics/
COPY packages/helix/package.json ./packages/helix/
COPY packages/helix-schema/package.json ./packages/helix-schema/
COPY packages/marketdata/package.json ./packages/marketdata/
COPY packages/indicators/package.json ./packages/indicators/
COPY packages/broker/package.json ./packages/broker/
COPY packages/regime/package.json ./packages/regime/
COPY packages/universe/package.json ./packages/universe/
COPY packages/external-context/package.json ./packages/external-context/
COPY packages/prediction-markets/package.json ./packages/prediction-markets/
COPY packages/agents/package.json ./packages/agents/
COPY packages/recovery/package.json ./packages/recovery/
COPY packages/mocks/package.json ./packages/mocks/
COPY packages/test-fixtures/package.json ./packages/test-fixtures/

# Copy api and worker package.json
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/

# Install all dependencies
RUN bun install --frozen-lockfile

# ===========================================
# Stage 2: Builder
# ===========================================
FROM oven/bun:1.3 AS builder
WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source files
COPY package.json bun.lock ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker

# Build dependencies in order
WORKDIR /app/packages/domain
RUN bun run build

WORKDIR /app/packages/config
RUN bun run build

WORKDIR /app/packages/metrics
RUN bun run build

WORKDIR /app/packages/helix-schema
RUN bun run build

WORKDIR /app/packages/storage
RUN bun run build

WORKDIR /app/packages/helix
RUN bun run build

WORKDIR /app/packages/broker
RUN bun run build

WORKDIR /app/packages/indicators
RUN bun run build

WORKDIR /app/packages/marketdata
RUN bun run build

WORKDIR /app/packages/regime
RUN bun run build

WORKDIR /app/packages/universe
RUN bun run build

WORKDIR /app/packages/external-context
RUN bun run build

WORKDIR /app/packages/prediction-markets
RUN bun run build

WORKDIR /app/packages/agents
RUN bun run build

# Build the api (dependency of worker)
WORKDIR /app/apps/api
RUN bun run build

# Build the worker
WORKDIR /app/apps/worker
ENV NODE_ENV=production
RUN bun build src/index.ts --outdir dist --target bun

# ===========================================
# Stage 3: Production Runner
# ===========================================
FROM oven/bun:1.3-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 worker

# Copy built application and necessary node_modules
COPY --from=builder --chown=worker:nodejs /app/apps/worker/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules

USER worker

CMD ["bun", "run", "dist/index.js"]
