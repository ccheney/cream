# syntax=docker/dockerfile:1
# Dashboard API (Hono) Dockerfile
#
# Multi-stage build for production Hono API deployment with Python research support.
# Uses oven/bun as the runtime with Python 3.12 for research analysis.
#
# Build: docker build -t cream-dashboard-api -f apps/dashboard-api/Dockerfile .
# Run:   docker run -p 3001:3001 -e TURSO_DATABASE_URL=... cream-dashboard-api

# ===========================================
# Stage 1: Dependencies
# ===========================================
FROM oven/bun:1.3.6 AS deps
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
COPY packages/dashboard-types/package.json ./packages/dashboard-types/
COPY packages/indicators/package.json ./packages/indicators/
COPY packages/broker/package.json ./packages/broker/

# Copy dashboard-api package.json
COPY apps/dashboard-api/package.json ./apps/dashboard-api/

# Install all dependencies
RUN bun install --frozen-lockfile

# ===========================================
# Stage 2: Builder
# ===========================================
FROM oven/bun:1.3.6 AS builder
WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source files
COPY package.json bun.lock ./
COPY packages ./packages
COPY apps/dashboard-api ./apps/dashboard-api

# Build dependencies
WORKDIR /app/packages/domain
RUN bun run build

WORKDIR /app/packages/config
RUN bun run build

WORKDIR /app/packages/metrics
RUN bun run build

WORKDIR /app/packages/dashboard-types
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

# Build the API
WORKDIR /app/apps/dashboard-api
ENV NODE_ENV=production
RUN bun build src/index.ts --outdir dist --target bun

# ===========================================
# Stage 3: Python Dependencies
# ===========================================
FROM python:3.12-slim AS python-deps
WORKDIR /app

# Install uv for faster dependency management
RUN pip install --no-cache-dir uv

# Copy Python package definition
COPY packages/research/pyproject.toml ./packages/research/
COPY packages/research/research/ ./packages/research/research/

# Install Python dependencies into a virtual environment
RUN python -m venv /opt/venv && \
    . /opt/venv/bin/activate && \
    cd packages/research && \
    uv pip install -e . && \
    # Clean up pip cache
    rm -rf ~/.cache/pip ~/.cache/uv

# ===========================================
# Stage 4: Production Runner
# ===========================================
FROM oven/bun:1.3.6-debian AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Install Python 3.12 runtime (slim version for production)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    libpython3.12 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 api

# Copy Python virtual environment from python-deps stage
COPY --from=python-deps /opt/venv /opt/venv

# Copy Python research package
COPY --from=python-deps /app/packages/research /app/packages/research

# Copy built application and necessary node_modules
COPY --from=builder --chown=api:nodejs /app/apps/dashboard-api/dist ./dist
COPY --from=builder --chown=api:nodejs /app/node_modules ./node_modules

# Set up Python environment
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONPATH="/app/packages/research"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Create temp directory for Parquet files with proper permissions
RUN mkdir -p /tmp/research && chown api:nodejs /tmp/research
ENV RESEARCH_TEMP_DIR="/tmp/research"

USER api

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["bun", "run", "dist/index.js"]
