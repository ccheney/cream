# Execution Engine Docker Image
# Multi-stage build for optimized production image
#
# Build: docker build -t cream/execution-engine:test -f apps/execution-engine/Dockerfile .
# Run:   docker run -p 50051:50051 cream/execution-engine:test
#
# Used by: testcontainers in integration tests

# ============================================
# Stage 1: Dependency cache
# ============================================
FROM rust:1.92-slim-bookworm AS deps

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Copy only manifests for dependency caching
COPY Cargo.toml Cargo.lock ./
COPY apps/execution-engine/Cargo.toml apps/execution-engine/Cargo.toml
COPY apps/alpaca-stream-proxy/Cargo.toml apps/alpaca-stream-proxy/Cargo.toml

# Create dummy sources to satisfy workspace resolution
RUN mkdir -p apps/execution-engine/src && \
    echo "fn main() {}" > apps/execution-engine/src/main.rs && \
    echo "" > apps/execution-engine/src/lib.rs && \
    mkdir -p apps/alpaca-stream-proxy/src && \
    echo "fn main() {}" > apps/alpaca-stream-proxy/src/main.rs

# Build dependencies only (this layer is cached until Cargo.toml/Cargo.lock change)
RUN cargo build --release -p execution-engine 2>/dev/null || true

# ============================================
# Stage 2: Build
# ============================================
FROM deps AS builder

# Copy real source and schema-gen
COPY apps/execution-engine/src apps/execution-engine/src
COPY apps/execution-engine/build.rs apps/execution-engine/build.rs
COPY packages/schema-gen packages/schema-gen

# Invalidate Cargo's fingerprint cache so it rebuilds with real source
RUN touch apps/execution-engine/src/main.rs apps/execution-engine/src/lib.rs

# Build the application
RUN cargo build --release -p execution-engine

# ============================================
# Stage 3: Runtime
# ============================================
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 cream

COPY --from=builder /workspace/target/release/execution-engine /usr/local/bin/

RUN chown cream:cream /usr/local/bin/execution-engine

USER cream

EXPOSE 50051

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD nc -z localhost 50051 || exit 1

ENV CREAM_ENV=PAPER
ENV RUST_LOG=info,execution_engine=debug

CMD ["execution-engine"]
