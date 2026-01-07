"""Filings Service - SEC Filings & Earnings Transcripts Ingestion.

This service handles:
- SEC filing retrieval and parsing (10-K, 10-Q, 8-K)
- Earnings call transcript ingestion
- Data extraction and storage to HelixDB
"""

__version__ = "0.1.0"

from .edgar_client import (
    EdgarClient,
    EdgarClientError,
    NotFoundError,
    RateLimitError,
)
from .models import (
    Company,
    Filing,
    FilingDocument,
    FilingType,
    FinancialData,
    Form8KItem,
    ParsedFiling,
)
from .parsers import (
    FilingParser,
    Form8KParser,
    Form10KParser,
    Form10QParser,
    get_parser,
    parse_filing,
)

__all__ = [
    # Client
    "EdgarClient",
    "EdgarClientError",
    "NotFoundError",
    "RateLimitError",
    # Models
    "Company",
    "Filing",
    "FilingDocument",
    "FilingType",
    "FinancialData",
    "Form8KItem",
    "ParsedFiling",
    # Parsers
    "FilingParser",
    "Form8KParser",
    "Form10KParser",
    "Form10QParser",
    "get_parser",
    "parse_filing",
]
