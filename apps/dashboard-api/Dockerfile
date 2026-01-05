# Cream Dashboard API - Hono/Bun Server
# ======================================
# Production deployment for the dashboard API
#
# Build: docker build -t cream-dashboard-api .
# Run:   docker run -p 3001:3001 cream-dashboard-api

# Stage 1: Install dependencies
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./
COPY ../../packages/domain/package.json ./packages/domain/
COPY ../../packages/storage/package.json ./packages/storage/

# Install dependencies
RUN bun install --frozen-lockfile --production

# Stage 2: Build the application
FROM oven/bun:1 AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript
RUN bun build src/index.ts --outdir=dist --target=bun

# Stage 3: Production image
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 bunjs && \
    adduser --system --uid 1001 hono

# Copy built application and dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

USER hono

EXPOSE 3001
ENV PORT=3001

CMD ["bun", "run", "dist/index.js"]
