# Alpaca Stream Proxy Docker Image
# Multi-stage build for optimized production image
#
# Build: docker build -t cream/alpaca-stream-proxy:test -f apps/alpaca-stream-proxy/Dockerfile .
# Run:   docker run -p 50052:50052 -p 8082:8082 cream/alpaca-stream-proxy:test
#
# Environment variables required:
#   ALPACA_API_KEY - Alpaca API key
#   ALPACA_API_SECRET - Alpaca API secret
#   CREAM_ENV - Environment (PAPER or LIVE)

# ============================================
# Stage 1: Dependency cache
# ============================================
FROM rust:1.92-slim-bookworm AS deps

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -sSL "https://github.com/bufbuild/buf/releases/download/v1.32.2/buf-Linux-x86_64" -o /usr/local/bin/buf \
    && chmod +x /usr/local/bin/buf

WORKDIR /workspace

# Copy only manifests for dependency caching
COPY Cargo.toml Cargo.lock ./
COPY apps/alpaca-stream-proxy/Cargo.toml apps/alpaca-stream-proxy/Cargo.toml
COPY apps/execution-engine/Cargo.toml apps/execution-engine/Cargo.toml

# Create dummy sources to satisfy workspace resolution
RUN mkdir -p apps/alpaca-stream-proxy/src && \
    echo "fn main() {}" > apps/alpaca-stream-proxy/src/main.rs && \
    mkdir -p apps/execution-engine/src && \
    echo "fn main() {}" > apps/execution-engine/src/main.rs && \
    echo "" > apps/execution-engine/src/lib.rs

# Build dependencies only (this layer is cached until Cargo.toml/Cargo.lock change)
RUN cargo build --release -p alpaca-stream-proxy 2>/dev/null || true

# ============================================
# Stage 2: Build
# ============================================
FROM deps AS builder

# Copy real source and proto definitions
COPY apps/alpaca-stream-proxy/src apps/alpaca-stream-proxy/src
COPY apps/alpaca-stream-proxy/build.rs apps/alpaca-stream-proxy/build.rs
COPY packages/proto packages/proto

# Invalidate Cargo's fingerprint cache so it rebuilds with real source
RUN touch apps/alpaca-stream-proxy/src/main.rs

# Build the application
RUN cargo build --release -p alpaca-stream-proxy

# ============================================
# Stage 3: Runtime
# ============================================
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 cream

COPY --from=builder /workspace/target/release/alpaca-stream-proxy /usr/local/bin/

RUN chown cream:cream /usr/local/bin/alpaca-stream-proxy

USER cream

EXPOSE 50052
EXPOSE 8082

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8082/healthz || exit 1

ENV CREAM_ENV=PAPER
ENV RUST_LOG=info,alpaca_stream_proxy=debug
ENV STREAM_PROXY_GRPC_PORT=50052
ENV STREAM_PROXY_HEALTH_PORT=8082

CMD ["alpaca-stream-proxy"]
