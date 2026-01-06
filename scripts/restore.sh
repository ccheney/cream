#!/bin/bash
#
# Database Restore Script
#
# Restores HelixDB or Turso databases from backup archives.
#
# Usage:
#   ./scripts/restore.sh helix <backup-file>    # Restore HelixDB
#   ./scripts/restore.sh turso <backup-file>    # Restore Turso
#   ./scripts/restore.sh list                   # List available backups
#
# WARNING: This will overwrite existing data!
#
# See: docs/plans/13-operations.md - Database Recovery section

set -euo pipefail

# ============================================
# Configuration
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# Helper Functions
# ============================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
}

confirm() {
    local message="$1"
    echo -e "${YELLOW}WARNING:${NC} $message"
    read -p "Are you sure you want to continue? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Restore cancelled"
        exit 0
    fi
}

# ============================================
# List Backups
# ============================================

list_backups() {
    echo ""
    echo "Available backups:"
    echo ""

    echo "Daily backups:"
    echo "--------------"
    if [ -d "$BACKUP_DIR/daily" ]; then
        ls -lh "$BACKUP_DIR/daily/" 2>/dev/null || echo "  (none)"
    else
        echo "  (directory not found)"
    fi

    echo ""
    echo "Weekly backups:"
    echo "---------------"
    if [ -d "$BACKUP_DIR/weekly" ]; then
        ls -lh "$BACKUP_DIR/weekly/" 2>/dev/null || echo "  (none)"
    else
        echo "  (directory not found)"
    fi
    echo ""
}

# ============================================
# Restore Functions
# ============================================

restore_helix() {
    local backup_file="$1"

    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        exit 1
    fi

    log_info "Restoring HelixDB from: $backup_file"

    confirm "This will OVERWRITE all existing HelixDB data!"

    # Stop HelixDB
    log_info "Stopping HelixDB container..."
    docker compose -f "$PROJECT_ROOT/infrastructure/docker-compose.yml" stop helixdb 2>/dev/null || true

    # Clear existing data
    log_info "Clearing existing data..."
    docker run --rm \
        -v cream_helix_data:/data \
        alpine sh -c "rm -rf /data/*"

    # Restore from backup
    log_info "Extracting backup..."
    docker run --rm \
        -v cream_helix_data:/data \
        -v "$(dirname "$backup_file"):/backup" \
        alpine tar xzf "/backup/$(basename "$backup_file")" -C /data

    # Restart HelixDB
    log_info "Restarting HelixDB container..."
    docker compose -f "$PROJECT_ROOT/infrastructure/docker-compose.yml" start helixdb 2>/dev/null || true

    # Wait for startup
    log_info "Waiting for HelixDB to start..."
    sleep 5

    # Verify health
    if curl -s http://localhost:6333/health | grep -q "ok"; then
        log_info "HelixDB restore complete and healthy!"
    else
        log_warn "HelixDB started but health check failed. Check logs."
    fi
}

restore_turso() {
    local backup_file="$1"

    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        exit 1
    fi

    log_info "Restoring Turso from: $backup_file"

    confirm "This will OVERWRITE all existing Turso data!"

    # Stop Turso
    log_info "Stopping Turso container..."
    docker compose -f "$PROJECT_ROOT/infrastructure/docker-compose.yml" stop turso 2>/dev/null || true

    # Clear existing data
    log_info "Clearing existing data..."
    docker run --rm \
        -v cream_turso_data:/data \
        alpine sh -c "rm -rf /data/*"

    # Restore from backup
    log_info "Extracting backup..."
    docker run --rm \
        -v cream_turso_data:/data \
        -v "$(dirname "$backup_file"):/backup" \
        alpine tar xzf "/backup/$(basename "$backup_file")" -C /data

    # Restart Turso
    log_info "Restarting Turso container..."
    docker compose -f "$PROJECT_ROOT/infrastructure/docker-compose.yml" start turso 2>/dev/null || true

    # Wait for startup
    log_info "Waiting for Turso to start..."
    sleep 5

    # Verify health
    if curl -s http://localhost:8080/health | grep -q "ok"; then
        log_info "Turso restore complete and healthy!"
    else
        log_warn "Turso started but health check failed. Check logs."
    fi
}

# ============================================
# Usage
# ============================================

usage() {
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  list                      List available backups"
    echo "  helix <backup-file>       Restore HelixDB from backup"
    echo "  turso <backup-file>       Restore Turso from backup"
    echo ""
    echo "Examples:"
    echo "  $0 list"
    echo "  $0 helix backups/daily/helix-20260105-120000.tar.gz"
    echo "  $0 turso backups/weekly/turso-20260101-000000.tar.gz"
    echo ""
    echo "WARNING: Restore operations will OVERWRITE existing data!"
}

# ============================================
# Main
# ============================================

main() {
    local command="${1:-}"
    local backup_file="${2:-}"

    echo ""
    echo "=========================================="
    echo " Cream Database Restore"
    echo " $(date)"
    echo "=========================================="
    echo ""

    case "$command" in
        list)
            list_backups
            ;;
        helix)
            if [ -z "$backup_file" ]; then
                log_error "Backup file required"
                usage
                exit 1
            fi
            check_docker
            restore_helix "$backup_file"
            ;;
        turso)
            if [ -z "$backup_file" ]; then
                log_error "Backup file required"
                usage
                exit 1
            fi
            check_docker
            restore_turso "$backup_file"
            ;;
        "")
            usage
            ;;
        *)
            log_error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

main "$@"
