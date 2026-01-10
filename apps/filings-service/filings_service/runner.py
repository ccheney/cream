#!/usr/bin/env python3
"""CLI runner for subprocess invocation from TypeScript.

This module provides a JSON-based IPC interface for the filings service,
allowing TypeScript code to invoke Python functionality via subprocess.

Protocol:
- Input: JSON lines on stdin
- Output: NDJSON (newline-delimited JSON) on stdout
- Each response includes a "type" field for message routing

Example:
    echo '{"command":"fetch_filings","params":{"symbols":["AAPL"]}}' | python -m filings_service.runner
"""

import asyncio
import json
import sys
from dataclasses import asdict
from datetime import date, datetime
from typing import Any

from . import (
    EdgarClient,
    EdgarClientError,
    Filing,
    FilingType,
    NotFoundError,
    ParsedFiling,
    RateLimitError,
    parse_filing,
)
from .chunker import chunk_parsed_filing, chunks_to_dicts


def json_serializer(obj: Any) -> Any:
    """Custom JSON serializer for dataclasses and date types."""
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, FilingType):
        return obj.value
    if hasattr(obj, "__dataclass_fields__"):
        return asdict(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def emit(data: dict[str, Any]) -> None:
    """Emit a JSON message to stdout."""
    print(json.dumps(data, default=json_serializer), flush=True)


def emit_error(message: str, code: str = "ERROR") -> None:
    """Emit an error message."""
    emit({"type": "error", "code": code, "message": message})


def emit_progress(
    symbol: str,
    processed: int,
    total: int,
    phase: str = "fetching",
) -> None:
    """Emit a progress update."""
    emit(
        {
            "type": "progress",
            "symbol": symbol,
            "processed": processed,
            "total": total,
            "phase": phase,
        }
    )


def parse_filing_types(types: list[str] | None) -> list[FilingType]:
    """Convert string filing types to FilingType enum."""
    if not types:
        return [FilingType.FORM_10K, FilingType.FORM_10Q, FilingType.FORM_8K]

    mapping = {
        "10-K": FilingType.FORM_10K,
        "10-Q": FilingType.FORM_10Q,
        "8-K": FilingType.FORM_8K,
        "DEF14A": FilingType.FORM_DEF14A,
        "DEF 14A": FilingType.FORM_DEF14A,
    }

    result = []
    for t in types:
        if t in mapping:
            result.append(mapping[t])
    return result if result else [FilingType.FORM_10K, FilingType.FORM_10Q, FilingType.FORM_8K]


def parse_date(date_str: str | None) -> date | None:
    """Parse an ISO date string."""
    if not date_str:
        return None
    try:
        return date.fromisoformat(date_str)
    except ValueError:
        return None


def filing_to_dict(filing: Filing) -> dict[str, Any]:
    """Convert a Filing to a serializable dict."""
    return {
        "accession_number": filing.accession_number,
        "filing_type": filing.filing_type.value,
        "filed_date": filing.filed_date.isoformat(),
        "report_date": filing.report_date.isoformat() if filing.report_date else None,
        "company": {
            "cik": filing.company.cik,
            "name": filing.company.name,
            "ticker": filing.company.ticker,
        },
        "primary_document": filing.primary_document,
        "items": filing.items,
    }


def parsed_filing_to_dict(parsed: ParsedFiling) -> dict[str, Any]:
    """Convert a ParsedFiling to a serializable dict."""
    return {
        "filing": filing_to_dict(parsed.filing),
        "sections": parsed.sections,
        "financial_tables": parsed.financial_tables,
        "extracted_text_length": len(parsed.extracted_text) if parsed.extracted_text else 0,
        "extracted_at": parsed.extracted_at.isoformat(),
    }


async def fetch_filings(params: dict[str, Any]) -> None:
    """Fetch filings for specified symbols.

    Params:
        symbols: List of ticker symbols
        filing_types: Optional list of filing types (default: 10-K, 10-Q, 8-K)
        start_date: Optional start date (ISO format)
        end_date: Optional end date (ISO format)
        limit_per_symbol: Max filings per symbol (default: 10)
        parse: Whether to parse filing content (default: True)
        chunk: Whether to chunk parsed filings for RAG (default: False)
    """
    symbols = params.get("symbols", [])
    if not symbols:
        emit_error("No symbols provided", "INVALID_PARAMS")
        return

    filing_types = parse_filing_types(params.get("filing_types"))
    start_date = parse_date(params.get("start_date"))
    end_date = parse_date(params.get("end_date"))
    limit_per_symbol = params.get("limit_per_symbol", 10)
    should_parse = params.get("parse", True)
    should_chunk = params.get("chunk", False)

    total_symbols = len(symbols)
    total_filings = 0
    total_parsed = 0
    total_chunks = 0

    async with EdgarClient() as client:
        for idx, symbol in enumerate(symbols):
            emit_progress(symbol, idx, total_symbols, "fetching")

            try:
                # Get company info first
                company = await client.get_company(symbol)
                if not company:
                    emit(
                        {
                            "type": "symbol_error",
                            "symbol": symbol,
                            "error": f"Company not found for symbol {symbol}",
                        }
                    )
                    continue

                # Fetch filings
                filings = await client.get_filings(
                    symbol,
                    filing_types=filing_types,
                    start_date=start_date,
                    end_date=end_date,
                    limit=limit_per_symbol,
                )

                emit_progress(symbol, idx, total_symbols, "parsing")

                for filing in filings:
                    total_filings += 1

                    if should_parse:
                        try:
                            # Fetch and parse filing content
                            html_content = await client.get_filing_html(filing)
                            parsed = parse_filing(filing, html_content)
                            total_parsed += 1

                            if should_chunk:
                                # Chunk for RAG
                                emit_progress(symbol, idx, total_symbols, "chunking")
                                chunks = chunk_parsed_filing(parsed)
                                total_chunks += len(chunks)

                                emit(
                                    {
                                        "type": "filing_chunked",
                                        "symbol": symbol,
                                        "accession_number": filing.accession_number,
                                        "filing_type": filing.filing_type.value,
                                        "filed_date": filing.filed_date.isoformat(),
                                        "chunks": chunks_to_dicts(chunks),
                                        "chunk_count": len(chunks),
                                    }
                                )
                            else:
                                emit(
                                    {
                                        "type": "filing",
                                        "symbol": symbol,
                                        "data": parsed_filing_to_dict(parsed),
                                    }
                                )
                        except EdgarClientError as e:
                            emit(
                                {
                                    "type": "parse_error",
                                    "symbol": symbol,
                                    "accession_number": filing.accession_number,
                                    "error": str(e),
                                }
                            )
                    else:
                        # Just emit metadata
                        emit(
                            {
                                "type": "filing_metadata",
                                "symbol": symbol,
                                "data": filing_to_dict(filing),
                            }
                        )

            except RateLimitError:
                emit_error(f"Rate limited while processing {symbol}", "RATE_LIMIT")
                # Wait a bit and continue
                await asyncio.sleep(10)
            except NotFoundError as e:
                emit(
                    {
                        "type": "symbol_error",
                        "symbol": symbol,
                        "error": str(e),
                    }
                )
            except EdgarClientError as e:
                emit(
                    {
                        "type": "symbol_error",
                        "symbol": symbol,
                        "error": str(e),
                    }
                )

    emit(
        {
            "type": "complete",
            "symbols_processed": total_symbols,
            "filings_fetched": total_filings,
            "filings_parsed": total_parsed,
            "chunks_created": total_chunks,
        }
    )


async def get_company(params: dict[str, Any]) -> None:
    """Get company information for a symbol."""
    symbol = params.get("symbol")
    if not symbol:
        emit_error("No symbol provided", "INVALID_PARAMS")
        return

    async with EdgarClient() as client:
        company = await client.get_company(symbol)
        if company:
            emit(
                {
                    "type": "company",
                    "data": asdict(company),
                }
            )
        else:
            emit_error(f"Company not found: {symbol}", "NOT_FOUND")


async def list_filings(params: dict[str, Any]) -> None:
    """List filings for a symbol without parsing content."""
    symbol = params.get("symbol")
    if not symbol:
        emit_error("No symbol provided", "INVALID_PARAMS")
        return

    filing_types = parse_filing_types(params.get("filing_types"))
    start_date = parse_date(params.get("start_date"))
    end_date = parse_date(params.get("end_date"))
    limit = params.get("limit", 50)

    async with EdgarClient() as client:
        filings = await client.get_filings(
            symbol,
            filing_types=filing_types,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
        )

        for filing in filings:
            emit(
                {
                    "type": "filing_metadata",
                    "data": filing_to_dict(filing),
                }
            )

        emit(
            {
                "type": "complete",
                "count": len(filings),
            }
        )


async def process_request(request: dict[str, Any]) -> None:
    """Process a single request."""
    command = request.get("command")
    params = request.get("params", {})

    if command == "fetch_filings":
        await fetch_filings(params)
    elif command == "get_company":
        await get_company(params)
    elif command == "list_filings":
        await list_filings(params)
    elif command == "ping":
        emit({"type": "pong", "version": "0.1.0"})
    else:
        emit_error(f"Unknown command: {command}", "UNKNOWN_COMMAND")


async def main() -> None:
    """Main entry point for the runner."""
    # Read JSON lines from stdin
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            await process_request(request)
        except json.JSONDecodeError as e:
            emit_error(f"Invalid JSON: {e}", "PARSE_ERROR")
        except KeyboardInterrupt:
            emit_error("Interrupted", "INTERRUPTED")
            break
        except Exception as e:
            emit_error(f"Unexpected error: {e}", "INTERNAL_ERROR")


if __name__ == "__main__":
    asyncio.run(main())
