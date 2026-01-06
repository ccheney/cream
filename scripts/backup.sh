#!/bin/bash
#
# Database Backup Script
#
# Backs up HelixDB and Turso databases to timestamped archives.
# Run daily at 00:00 UTC (market closed) via cron.
#
# Usage:
#   ./scripts/backup.sh                    # Backup both databases
#   ./scripts/backup.sh helix              # Backup HelixDB only
#   ./scripts/backup.sh turso              # Backup Turso only
#
# Environment:
#   BACKUP_DIR       - Backup directory (default: ./backups)
#   KEEP_DAILY       - Number of daily backups to keep (default: 7)
#   KEEP_WEEKLY      - Number of weekly backups to keep (default: 4)
#
# See: docs/plans/13-operations.md - Database Recovery section

set -euo pipefail

# ============================================
# Configuration
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DATE=$(date +%Y%m%d)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday

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

ensure_backup_dir() {
    mkdir -p "$BACKUP_DIR/daily"
    mkdir -p "$BACKUP_DIR/weekly"
}

# ============================================
# Backup Functions
# ============================================

backup_helix() {
    log_info "Backing up HelixDB..."

    local backup_file="$BACKUP_DIR/daily/helix-$TIMESTAMP.tar.gz"

    # Stop HelixDB for consistent backup
    log_info "Stopping HelixDB container..."
    docker compose -f "$PROJECT_ROOT/infrastructure/docker-compose.yml" stop helixdb 2>/dev/null || true

    # Create backup using docker
    log_info "Creating backup archive..."
    docker run --rm \
        -v cream_helix_data:/data \
        -v "$BACKUP_DIR/daily:/backup" \
        alpine tar czf "/backup/helix-$TIMESTAMP.tar.gz" -C /data .

    # Restart HelixDB
    log_info "Restarting HelixDB container..."
    docker compose -f "$PROJECT_ROOT/infrastructure/docker-compose.yml" start helixdb 2>/dev/null || true

    if [ -f "$backup_file" ]; then
        local size=$(du -h "$backup_file" | cut -f1)
        log_info "HelixDB backup complete: $backup_file ($size)"
    else
        log_error "HelixDB backup failed: file not created"
        return 1
    fi
}

backup_turso() {
    log_info "Backing up Turso database..."

    local backup_file="$BACKUP_DIR/daily/turso-$TIMESTAMP.tar.gz"

    # Stop Turso for consistent backup
    log_info "Stopping Turso container..."
    docker compose -f "$PROJECT_ROOT/infrastructure/docker-compose.yml" stop turso 2>/dev/null || true

    # Create backup using docker
    log_info "Creating backup archive..."
    docker run --rm \
        -v cream_turso_data:/data \
        -v "$BACKUP_DIR/daily:/backup" \
        alpine tar czf "/backup/turso-$TIMESTAMP.tar.gz" -C /data .

    # Restart Turso
    log_info "Restarting Turso container..."
    docker compose -f "$PROJECT_ROOT/infrastructure/docker-compose.yml" start turso 2>/dev/null || true

    if [ -f "$backup_file" ]; then
        local size=$(du -h "$backup_file" | cut -f1)
        log_info "Turso backup complete: $backup_file ($size)"
    else
        log_error "Turso backup failed: file not created"
        return 1
    fi
}

# ============================================
# Retention Policy
# ============================================

apply_retention() {
    log_info "Applying retention policy..."

    # Keep only KEEP_DAILY daily backups
    for prefix in helix turso; do
        local count=$(ls -1 "$BACKUP_DIR/daily/$prefix-"* 2>/dev/null | wc -l)
        if [ "$count" -gt "$KEEP_DAILY" ]; then
            local to_delete=$((count - KEEP_DAILY))
            log_info "Removing $to_delete old $prefix daily backups..."
            ls -1t "$BACKUP_DIR/daily/$prefix-"* | tail -n "$to_delete" | xargs rm -f
        fi
    done

    # Promote Sunday backups to weekly
    if [ "$DAY_OF_WEEK" -eq 7 ]; then
        log_info "Sunday: Promoting today's backup to weekly..."
        for file in "$BACKUP_DIR/daily/"*"-$DATE"*; do
            if [ -f "$file" ]; then
                cp "$file" "$BACKUP_DIR/weekly/"
            fi
        done
    fi

    # Keep only KEEP_WEEKLY weekly backups
    for prefix in helix turso; do
        local count=$(ls -1 "$BACKUP_DIR/weekly/$prefix-"* 2>/dev/null | wc -l)
        if [ "$count" -gt "$KEEP_WEEKLY" ]; then
            local to_delete=$((count - KEEP_WEEKLY))
            log_info "Removing $to_delete old $prefix weekly backups..."
            ls -1t "$BACKUP_DIR/weekly/$prefix-"* | tail -n "$to_delete" | xargs rm -f
        fi
    done

    log_info "Retention policy applied"
}

# ============================================
# Main
# ============================================

main() {
    local target="${1:-all}"

    echo ""
    echo "=========================================="
    echo " Cream Database Backup"
    echo " $(date)"
    echo "=========================================="
    echo ""

    check_docker
    ensure_backup_dir

    case "$target" in
        helix)
            backup_helix
            ;;
        turso)
            backup_turso
            ;;
        all)
            backup_helix
            backup_turso
            ;;
        *)
            log_error "Unknown target: $target"
            echo "Usage: $0 [helix|turso|all]"
            exit 1
            ;;
    esac

    apply_retention

    echo ""
    log_info "Backup complete!"
    echo ""

    # List recent backups
    echo "Recent backups:"
    ls -lh "$BACKUP_DIR/daily/" | tail -5
}

main "$@"
