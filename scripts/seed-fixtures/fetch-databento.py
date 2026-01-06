#!/usr/bin/env python3
"""
Fetch Databento Execution-Grade Tick Data Fixtures

Captures L1 quotes and trades for development fixtures.

Usage: uv run scripts/seed-fixtures/fetch-databento.py

Note: Uses free credits from signup. Check dashboard for usage.

See: docs/plans/17-mock-data-layer.md
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

# ============================================
# Configuration
# ============================================

PROJECT_ROOT = Path(__file__).parent.parent.parent
FIXTURES_DIR = PROJECT_ROOT / "packages" / "marketdata" / "fixtures" / "databento"

# ============================================
# Environment Validation
# ============================================

DATABENTO_KEY = os.environ.get("DATABENTO_KEY")

if not DATABENTO_KEY:
    print("❌ Missing required environment variable: DATABENTO_KEY")
    print("\nCreate .env.local with your Databento API key.")
    print("Sign up at: https://databento.com/signup")
    sys.exit(1)

# ============================================
# Main
# ============================================


def main() -> None:
    """Fetch and save Databento fixtures."""
    print("\n🟠 Databento Fixture Generator\n")
    print(f"Output: {FIXTURES_DIR}\n")

    # Ensure fixtures directory exists
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)

    # Try to import databento
    try:
        import databento as db
    except ImportError:
        print("❌ databento package not installed.")
        print("\nInstall with: uv add databento")
        print("Or run: pip install databento")
        sys.exit(1)

    success = 0
    failed = 0

    # Calculate date range (last week)
    end_date = date.today() - timedelta(days=1)
    start_date = end_date - timedelta(days=7)

    print(f"Date range: {start_date} to {end_date}")
    print()

    # Create client
    try:
        client = db.Historical(key=DATABENTO_KEY)
    except Exception as e:
        print(f"❌ Failed to create Databento client: {e}")
        sys.exit(1)

    # 1. Fetch L1 trades for AAPL
    print("→ Fetching AAPL trades...")
    try:
        data = client.timeseries.get_range(
            dataset="XNAS.ITCH",  # NASDAQ
            symbols=["AAPL"],
            schema="trades",
            start=start_date.isoformat(),
            end=end_date.isoformat(),
            limit=100,
        )

        # Convert to list of dicts
        records = []
        for record in data:
            records.append(
                {
                    "ts_event": str(record.ts_event),
                    "price": float(record.price) / 1e9,  # Fixed point to float
                    "size": int(record.size),
                    "symbol": "AAPL",
                }
            )

        filepath = FIXTURES_DIR / "trades-AAPL.json"
        with open(filepath, "w") as f:
            json.dump(records, f, indent=2)
        print(f"  ✓ Saved {len(records)} trades to trades-AAPL.json")
        success += 1
    except Exception as e:
        print(f"  ✗ Error: {e}")
        failed += 1

    # 2. Fetch L1 quotes for AAPL
    print("→ Fetching AAPL quotes...")
    try:
        data = client.timeseries.get_range(
            dataset="XNAS.ITCH",
            symbols=["AAPL"],
            schema="mbp-1",  # Top of book quotes
            start=start_date.isoformat(),
            end=end_date.isoformat(),
            limit=100,
        )

        # Convert to list of dicts
        records = []
        for record in data:
            records.append(
                {
                    "ts_event": str(record.ts_event),
                    "bid_px": float(record.levels[0].bid_px) / 1e9 if record.levels else None,
                    "ask_px": float(record.levels[0].ask_px) / 1e9 if record.levels else None,
                    "bid_sz": int(record.levels[0].bid_sz) if record.levels else None,
                    "ask_sz": int(record.levels[0].ask_sz) if record.levels else None,
                    "symbol": "AAPL",
                }
            )

        filepath = FIXTURES_DIR / "quotes-AAPL.json"
        with open(filepath, "w") as f:
            json.dump(records, f, indent=2)
        print(f"  ✓ Saved {len(records)} quotes to quotes-AAPL.json")
        success += 1
    except Exception as e:
        print(f"  ✗ Error: {e}")
        failed += 1

    # 3. Save metadata
    print("→ Saving metadata...")
    try:
        metadata = {
            "dataset": "XNAS.ITCH",
            "symbols": ["AAPL"],
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "generated_at": date.today().isoformat(),
        }
        filepath = FIXTURES_DIR / "metadata.json"
        with open(filepath, "w") as f:
            json.dump(metadata, f, indent=2)
        print("  ✓ Saved metadata.json")
        success += 1
    except Exception as e:
        print(f"  ✗ Error: {e}")
        failed += 1

    # Summary
    print()
    print("─" * 40)
    print(f"✓ Databento fixtures complete: {success} succeeded, {failed} failed")

    if failed > 0:
        print("\n⚠️  Some fetches failed. Check your API key and credits.")
        print("   View usage at: https://databento.com/portal/dashboard")


if __name__ == "__main__":
    main()
