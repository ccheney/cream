# Cream Dashboard - Next.js Frontend
# ===================================
# Multi-stage build for production deployment
#
# Build: docker compose build dashboard
# Run:   docker compose up dashboard

# Stage 1: Install dependencies
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy package files for dependency installation
COPY package.json bunfig.toml bun.lock ./
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages ./packages

# Install all dependencies + typescript (required by Next.js type checking)
RUN bun install --ignore-scripts && bun add typescript@5 --dev --no-save

# Stage 2: Build the application
FROM oven/bun:1 AS builder
WORKDIR /app

# NEXT_PUBLIC_* vars must be available at build time (baked into client JS)
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

# Copy everything from deps (includes node_modules)
COPY --from=deps /app ./

# Copy dashboard source
COPY apps/dashboard ./apps/dashboard

# Build Next.js
WORKDIR /app/apps/dashboard
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN bun run build

# Stage 3: Production image
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built application (standalone preserves monorepo structure)
COPY --from=builder --chown=bun:bun /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/apps/dashboard/public ./apps/dashboard/public
COPY --from=builder --chown=bun:bun /app/apps/dashboard/.next/static ./apps/dashboard/.next/static

# Set working directory to where server.js is located
WORKDIR /app/apps/dashboard

USER bun

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"]
