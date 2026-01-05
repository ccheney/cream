# Cream Dashboard - Next.js Frontend
# ===================================
# Multi-stage build for production deployment
#
# Build: docker build -t cream-dashboard .
# Run:   docker run -p 3000:3000 cream-dashboard

# Stage 1: Install dependencies
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./
COPY ../../packages/domain/package.json ./packages/domain/

# Install dependencies
RUN bun install --frozen-lockfile

# Stage 2: Build the application
FROM oven/bun:1 AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN bun run build

# Stage 3: Production image
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"]
