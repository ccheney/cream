"""Data models for SEC filings.

Defines dataclasses for SEC filings, company information, and parsed filing data.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Any


class FilingType(str, Enum):
    """SEC filing types we support."""

    FORM_10K = "10-K"
    FORM_10Q = "10-Q"
    FORM_8K = "8-K"
    FORM_DEF14A = "DEF 14A"


@dataclass
class Company:
    """Company information from SEC."""

    cik: str
    name: str
    ticker: str | None = None
    sic: str | None = None
    sic_description: str | None = None
    fiscal_year_end: str | None = None
    state_of_incorporation: str | None = None


@dataclass
class Filing:
    """SEC filing metadata."""

    accession_number: str
    filing_type: FilingType
    filed_date: date
    report_date: date | None
    company: Company
    primary_document: str
    primary_document_description: str | None = None
    form_name: str | None = None
    items: list[str] = field(default_factory=list)
    size: int | None = None


@dataclass
class FilingDocument:
    """A document within a filing."""

    sequence: int
    description: str
    document_url: str
    document_type: str
    size: int | None = None


@dataclass
class ParsedFiling:
    """Parsed filing with extracted content."""

    filing: Filing
    raw_html: str | None = None
    extracted_text: str | None = None
    sections: dict[str, str] = field(default_factory=dict)
    financial_tables: list[dict[str, Any]] = field(default_factory=list)
    extracted_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class Form8KItem:
    """Item from an 8-K filing."""

    item_number: str
    item_title: str
    content: str


@dataclass
class FinancialData:
    """Extracted financial data from 10-K/10-Q."""

    revenue: float | None = None
    net_income: float | None = None
    total_assets: float | None = None
    total_liabilities: float | None = None
    cash_and_equivalents: float | None = None
    operating_income: float | None = None
    eps_basic: float | None = None
    eps_diluted: float | None = None
    shares_outstanding: int | None = None
    period_end_date: date | None = None
    fiscal_year: int | None = None
    fiscal_quarter: int | None = None
