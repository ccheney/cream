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
# Stage 1: Build
# ============================================
FROM rust:1.92-slim-bookworm AS builder

# Install build dependencies (includes buf for proto generation)
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install buf (for protobuf generation in build.rs)
RUN curl -sSL "https://github.com/bufbuild/buf/releases/download/v1.32.2/buf-Linux-x86_64" -o /usr/local/bin/buf \
    && chmod +x /usr/local/bin/buf

# Create workspace directory
WORKDIR /workspace

# Copy Cargo workspace files for dependency caching
COPY Cargo.toml Cargo.lock ./

# Copy the alpaca-stream-proxy package and proto definitions
COPY apps/alpaca-stream-proxy apps/alpaca-stream-proxy
COPY packages/proto packages/proto

# Create dummy main.rs for dependency caching (if needed)
RUN mkdir -p apps/alpaca-stream-proxy/src && \
    echo "fn main() {}" > apps/alpaca-stream-proxy/src/main.rs 2>/dev/null || true

# Build dependencies first (cached layer)
RUN cargo build --release -p alpaca-stream-proxy 2>/dev/null || true

# Copy actual source
COPY apps/alpaca-stream-proxy/src apps/alpaca-stream-proxy/src
COPY apps/alpaca-stream-proxy/build.rs apps/alpaca-stream-proxy/build.rs

# Build the application
RUN cargo build --release -p alpaca-stream-proxy

# ============================================
# Stage 2: Runtime
# ============================================
FROM debian:bookworm-slim AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 cream

# Copy binary from builder
COPY --from=builder /workspace/target/release/alpaca-stream-proxy /usr/local/bin/

# Set ownership
RUN chown cream:cream /usr/local/bin/alpaca-stream-proxy

# Switch to non-root user
USER cream

# Expose ports (gRPC and health check)
EXPOSE 50052
EXPOSE 8082

# Health check using HTTP endpoint
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8082/healthz || exit 1

# Default environment
ENV CREAM_ENV=PAPER
ENV RUST_LOG=info,alpaca_stream_proxy=debug
ENV STREAM_PROXY_GRPC_PORT=50052
ENV STREAM_PROXY_HEALTH_PORT=8082

# Run the server
CMD ["alpaca-stream-proxy"]
