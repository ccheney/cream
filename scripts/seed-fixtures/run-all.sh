#!/usr/bin/env bash
#
# Master Fixture Generation Script
#
# Runs all fixture fetch scripts in the correct order,
# respecting rate limits and dependencies.
#
# Usage: ./scripts/seed-fixtures/run-all.sh
#
# See: docs/plans/17-mock-data-layer.md

set -euo pipefail

# ============================================
# Configuration
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURE_DIR="$PROJECT_ROOT/packages/marketdata/fixtures"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================
# Helper Functions
# ============================================

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================
# Prerequisites Check
# ============================================

check_prerequisites() {
  log_info "Checking prerequisites..."

  local missing=()

  # Check required env vars
  if [[ -z "${ALPACA_KEY:-}" ]]; then missing+=("ALPACA_KEY"); fi
  if [[ -z "${ALPACA_SECRET:-}" ]]; then missing+=("ALPACA_SECRET"); fi
  if [[ -z "${ALPHAVANTAGE_KEY:-}" ]]; then missing+=("ALPHAVANTAGE_KEY"); fi

  # Check for bun
  if ! command -v bun &> /dev/null; then
    log_error "bun is required but not installed"
    exit 1
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    log_error "Missing required environment variables:"
    for var in "${missing[@]}"; do
      echo "  - $var"
    done
    echo ""
    echo "Create .env.local in project root with required API keys."
    echo "See: scripts/seed-fixtures/README.md"
    exit 1
  fi

  log_success "Prerequisites check passed"
}

# ============================================
# Fixture Directory Setup
# ============================================

setup_directories() {
  log_info "Setting up fixture directories..."

  mkdir -p "$FIXTURE_DIR/alpaca"
  mkdir -p "$FIXTURE_DIR/fmp"
  mkdir -p "$FIXTURE_DIR/alphavantage"

  log_success "Fixture directories created"
}

# ============================================
# Script Runners
# ============================================

run_alpaca() {
  log_info "Running fetch-alpaca.ts (1/3)..."

  if bun "$SCRIPT_DIR/fetch-alpaca.ts"; then
    log_success "fetch-alpaca.ts complete"
    return 0
  else
    log_error "fetch-alpaca.ts failed"
    return 1
  fi
}

run_fmp() {
  log_info "Running fetch-fmp.ts (2/3)..."

  if bun "$SCRIPT_DIR/fetch-fmp.ts"; then
    log_success "fetch-fmp.ts complete"
    return 0
  else
    log_error "fetch-fmp.ts failed"
    return 1
  fi
}

run_alphavantage() {
  log_info "Running fetch-alphavantage.ts (3/3)..."
  log_info "Note: Limited to 25 req/day, ~1 min total"

  if bun "$SCRIPT_DIR/fetch-alphavantage.ts"; then
    log_success "fetch-alphavantage.ts complete"
    return 0
  else
    log_error "fetch-alphavantage.ts failed"
    return 1
  fi
}

# ============================================
# Main
# ============================================

main() {
  echo ""
  echo "========================================"
  echo "  Cream Fixture Generation Script"
  echo "========================================"
  echo ""
  echo "This script will fetch API fixtures from:"
  echo "  1. Alpaca (paper trading, candles, quotes)"
  echo "  2. FMP (fundamentals)"
  echo "  3. Alpha Vantage (macro)"
  echo ""
  echo "Estimated time: ~2 minutes"
  echo ""

  # Change to project root
  cd "$PROJECT_ROOT"

  # Load .env.local if it exists
  if [[ -f ".env.local" ]]; then
    log_info "Loading .env.local..."
    set -a
    source .env.local
    set +a
  fi

  # Run checks and scripts
  check_prerequisites
  setup_directories

  local failed=0

  run_alpaca || ((failed++))
  run_fmp || ((failed++))
  run_alphavantage || ((failed++))

  echo ""
  echo "========================================"

  if [[ $failed -eq 0 ]]; then
    log_success "All scripts completed successfully!"
    echo ""
    echo "Fixtures saved to: $FIXTURE_DIR"
    echo ""
    echo "Next steps:"
    echo "  1. git add packages/marketdata/fixtures/"
    echo "  2. git commit -m 'Add API fixtures for testing'"
    echo "  3. rm -rf scripts/seed-fixtures/ (cleanup)"
  else
    log_error "$failed script(s) failed"
    echo ""
    echo "Check the output above for errors."
    exit 1
  fi

  echo "========================================"
  echo ""
}

main "$@"
