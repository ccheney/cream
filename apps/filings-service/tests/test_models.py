"""Tests for data models."""

from datetime import date, datetime

from filings_service.models import (
    Company,
    Filing,
    FilingDocument,
    FilingType,
    FinancialData,
    Form8KItem,
    ParsedFiling,
)


class TestFilingType:
    """Tests for FilingType enum."""

    def test_filing_type_values(self) -> None:
        """Test filing type enum values."""
        assert FilingType.FORM_10K.value == "10-K"
        assert FilingType.FORM_10Q.value == "10-Q"
        assert FilingType.FORM_8K.value == "8-K"
        assert FilingType.FORM_DEF14A.value == "DEF 14A"

    def test_filing_type_from_string(self) -> None:
        """Test creating filing type from string."""
        assert FilingType("10-K") == FilingType.FORM_10K
        assert FilingType("10-Q") == FilingType.FORM_10Q
        assert FilingType("8-K") == FilingType.FORM_8K


class TestCompany:
    """Tests for Company dataclass."""

    def test_company_required_fields(self) -> None:
        """Test company with required fields only."""
        company = Company(cik="0000320193", name="Apple Inc.")
        assert company.cik == "0000320193"
        assert company.name == "Apple Inc."
        assert company.ticker is None
        assert company.sic is None

    def test_company_all_fields(self) -> None:
        """Test company with all fields."""
        company = Company(
            cik="0000320193",
            name="Apple Inc.",
            ticker="AAPL",
            sic="3571",
            sic_description="Electronic Computers",
            fiscal_year_end="0928",
            state_of_incorporation="CA",
        )
        assert company.ticker == "AAPL"
        assert company.sic == "3571"
        assert company.fiscal_year_end == "0928"


class TestFiling:
    """Tests for Filing dataclass."""

    def test_filing_required_fields(self) -> None:
        """Test filing with required fields."""
        company = Company(cik="0000320193", name="Apple Inc.")
        filing = Filing(
            accession_number="0000320193-24-000081",
            filing_type=FilingType.FORM_10K,
            filed_date=date(2024, 11, 1),
            report_date=date(2024, 9, 28),
            company=company,
            primary_document="aapl-20240928.htm",
        )
        assert filing.accession_number == "0000320193-24-000081"
        assert filing.filing_type == FilingType.FORM_10K
        assert filing.filed_date == date(2024, 11, 1)
        assert filing.items == []

    def test_filing_with_items(self) -> None:
        """Test 8-K filing with items."""
        company = Company(cik="0000320193", name="Apple Inc.")
        filing = Filing(
            accession_number="0000320193-24-000082",
            filing_type=FilingType.FORM_8K,
            filed_date=date(2024, 10, 31),
            report_date=date(2024, 10, 31),
            company=company,
            primary_document="aapl-20241031.htm",
            items=["2.02", "9.01"],
        )
        assert filing.items == ["2.02", "9.01"]


class TestFilingDocument:
    """Tests for FilingDocument dataclass."""

    def test_filing_document(self) -> None:
        """Test filing document creation."""
        doc = FilingDocument(
            sequence=1,
            description="10-K",
            document_url="https://www.sec.gov/Archives/...",
            document_type="10-K",
            size=1234567,
        )
        assert doc.sequence == 1
        assert doc.document_type == "10-K"


class TestParsedFiling:
    """Tests for ParsedFiling dataclass."""

    def test_parsed_filing_defaults(self) -> None:
        """Test parsed filing with defaults."""
        company = Company(cik="0000320193", name="Apple Inc.")
        filing = Filing(
            accession_number="0000320193-24-000081",
            filing_type=FilingType.FORM_10K,
            filed_date=date(2024, 11, 1),
            report_date=date(2024, 9, 28),
            company=company,
            primary_document="aapl-20240928.htm",
        )
        parsed = ParsedFiling(filing=filing)
        assert parsed.filing == filing
        assert parsed.raw_html is None
        assert parsed.sections == {}
        assert parsed.financial_tables == []
        assert isinstance(parsed.extracted_at, datetime)

    def test_parsed_filing_with_content(self) -> None:
        """Test parsed filing with extracted content."""
        company = Company(cik="0000320193", name="Apple Inc.")
        filing = Filing(
            accession_number="0000320193-24-000081",
            filing_type=FilingType.FORM_10K,
            filed_date=date(2024, 11, 1),
            report_date=date(2024, 9, 28),
            company=company,
            primary_document="aapl-20240928.htm",
        )
        parsed = ParsedFiling(
            filing=filing,
            raw_html="<html>...</html>",
            extracted_text="Apple Inc. designs...",
            sections={"business": "Apple designs and sells..."},
            financial_tables=[{"headers": ["Revenue"], "rows": [["394.3B"]]}],
        )
        assert "Apple" in parsed.extracted_text
        assert "business" in parsed.sections


class TestForm8KItem:
    """Tests for Form8KItem dataclass."""

    def test_form_8k_item(self) -> None:
        """Test 8-K item creation."""
        item = Form8KItem(
            item_number="2.02",
            item_title="Results of Operations and Financial Condition",
            content="On October 31, 2024, Apple Inc. announced...",
        )
        assert item.item_number == "2.02"
        assert "Results" in item.item_title
        assert "Apple" in item.content


class TestFinancialData:
    """Tests for FinancialData dataclass."""

    def test_financial_data_defaults(self) -> None:
        """Test financial data with defaults."""
        data = FinancialData()
        assert data.revenue is None
        assert data.net_income is None
        assert data.eps_basic is None

    def test_financial_data_with_values(self) -> None:
        """Test financial data with values."""
        data = FinancialData(
            revenue=394328000000,
            net_income=93736000000,
            total_assets=352583000000,
            eps_basic=6.11,
            eps_diluted=6.08,
            shares_outstanding=15343783000,
            period_end_date=date(2024, 9, 28),
            fiscal_year=2024,
        )
        assert data.revenue == 394328000000
        assert data.fiscal_year == 2024
