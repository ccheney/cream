# syntax=docker/dockerfile:1
# Dashboard (Next.js) Dockerfile
#
# Multi-stage build for production Next.js deployment with standalone output.
# Uses oven/bun as the runtime for improved performance.
#
# Build: docker build -t cream-dashboard -f apps/dashboard/Dockerfile .
# Run:   docker run -p 3000:3000 cream-dashboard

# ===========================================
# Stage 1: Dependencies
# ===========================================
FROM oven/bun:1.3.6 AS deps
WORKDIR /app

# Copy workspace configuration
COPY package.json bun.lock ./
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/dashboard-types/package.json ./packages/dashboard-types/

# Copy dashboard package.json
COPY apps/dashboard/package.json ./apps/dashboard/

# Install all dependencies (including devDependencies for build)
RUN bun install --frozen-lockfile

# ===========================================
# Stage 2: Builder
# ===========================================
FROM oven/bun:1.3.6 AS builder
WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/tsconfig/node_modules ./packages/tsconfig/node_modules
COPY --from=deps /app/packages/dashboard-types/node_modules ./packages/dashboard-types/node_modules
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules

# Copy source files
COPY package.json bun.lock ./
COPY packages/tsconfig ./packages/tsconfig
COPY packages/dashboard-types ./packages/dashboard-types
COPY apps/dashboard ./apps/dashboard

# Build dashboard-types dependency first
WORKDIR /app/packages/dashboard-types
RUN bun run build

# Build the Next.js app
WORKDIR /app/apps/dashboard
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ===========================================
# Stage 3: Production Runner
# ===========================================
FROM oven/bun:1.3.6-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/public ./apps/dashboard/public

USER nextjs

EXPOSE 3000

# Start the Next.js server
CMD ["bun", "run", "apps/dashboard/server.js"]
