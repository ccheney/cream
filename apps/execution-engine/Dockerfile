# Execution Engine Docker Image
# Multi-stage build for optimized production image
#
# Build: docker build -t cream/execution-engine:test -f apps/execution-engine/Dockerfile .
# Run:   docker run -p 50051:50051 cream/execution-engine:test
#
# Used by: testcontainers in integration tests
# See: apps/api/tests/integration/execution.test.ts

# ============================================
# Stage 1: Build
# ============================================
FROM rust:1.92-slim-bookworm AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

# Create workspace directory
WORKDIR /workspace

# Copy Cargo workspace files for dependency caching
COPY Cargo.toml Cargo.lock ./

# Copy the execution-engine package and schema-gen
COPY apps/execution-engine apps/execution-engine
COPY packages/schema-gen packages/schema-gen

# Create dummy main.rs for dependency caching (if needed)
RUN mkdir -p apps/execution-engine/src && \
    echo "fn main() {}" > apps/execution-engine/src/main.rs 2>/dev/null || true

# Build dependencies first (cached layer)
RUN cargo build --release -p execution-engine 2>/dev/null || true

# Copy actual source
COPY apps/execution-engine/src apps/execution-engine/src
COPY apps/execution-engine/build.rs apps/execution-engine/build.rs

# Build the application
RUN cargo build --release -p execution-engine

# ============================================
# Stage 2: Runtime
# ============================================
FROM debian:bookworm-slim AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 cream

# Copy binary from builder
COPY --from=builder /workspace/target/release/execution-engine /usr/local/bin/

# Set ownership
RUN chown cream:cream /usr/local/bin/execution-engine

# Switch to non-root user
USER cream

# Expose gRPC port
EXPOSE 50051

# Health check (gRPC reflection or simple TCP)
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD nc -z localhost 50051 || exit 1

# Set environment for test mode
ENV CREAM_ENV=PAPER
ENV RUST_LOG=info,execution_engine=debug

# Run the server
CMD ["execution-engine"]
