# Cream Dashboard API - Hono/Bun Server
# ======================================
# Production deployment for the dashboard API
#
# Build: docker compose build dashboard-api
# Run:   docker compose up dashboard-api

# Stage 1: Install dependencies
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy package files for dependency installation
COPY package.json bunfig.toml bun.lock ./
COPY apps/dashboard-api/package.json ./apps/dashboard-api/
COPY packages ./packages

# Install production dependencies
RUN bun install --ignore-scripts

# Stage 2: Production image (bun runs TypeScript directly)
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy node_modules and source with correct ownership
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=deps --chown=bun:bun /app/packages ./packages
COPY --chown=bun:bun apps/dashboard-api ./apps/dashboard-api

WORKDIR /app/apps/dashboard-api

USER bun

EXPOSE 3001
ENV PORT=3001

CMD ["bun", "run", "src/index.ts"]
