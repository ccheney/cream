"""Tests for SEC EDGAR client."""

from datetime import date

import pytest
from pytest_httpx import HTTPXMock

from filings_service.edgar_client import (
    EdgarClient,
    EdgarClientError,
    NotFoundError,
    RateLimitError,
)
from filings_service.models import FilingType


class TestEdgarClientInit:
    """Tests for EdgarClient initialization."""

    def test_client_not_initialized_error(self) -> None:
        """Test error when client not initialized in context."""
        client = EdgarClient()
        with pytest.raises(EdgarClientError, match="not initialized"):
            # Can't use async directly without context
            import asyncio

            asyncio.get_event_loop().run_until_complete(
                client._get("https://example.com")  # noqa: SLF001
            )


class TestNormalizeCik:
    """Tests for CIK normalization."""

    def test_normalize_cik_short(self) -> None:
        """Test normalizing short CIK."""
        assert EdgarClient._normalize_cik("320193") == "0000320193"

    def test_normalize_cik_with_leading_zeros(self) -> None:
        """Test normalizing CIK with leading zeros."""
        assert EdgarClient._normalize_cik("0000320193") == "0000320193"

    def test_normalize_cik_already_normalized(self) -> None:
        """Test already normalized CIK."""
        assert EdgarClient._normalize_cik("1234567890") == "1234567890"


class TestLookupCik:
    """Tests for CIK lookup."""

    @pytest.fixture
    def tickers_response(self) -> dict:
        """Sample company tickers response."""
        return {
            "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
            "1": {"cik_str": 789019, "ticker": "MSFT", "title": "Microsoft Corporation"},
            "2": {"cik_str": 1018724, "ticker": "AMZN", "title": "Amazon.com Inc."},
        }

    async def test_lookup_cik_found(self, httpx_mock: HTTPXMock, tickers_response: dict) -> None:
        """Test looking up CIK for known ticker."""
        httpx_mock.add_response(json=tickers_response)

        async with EdgarClient() as client:
            cik = await client.lookup_cik("AAPL")
            assert cik == "0000320193"

    async def test_lookup_cik_case_insensitive(
        self, httpx_mock: HTTPXMock, tickers_response: dict
    ) -> None:
        """Test CIK lookup is case insensitive."""
        httpx_mock.add_response(json=tickers_response)

        async with EdgarClient() as client:
            cik = await client.lookup_cik("aapl")
            assert cik == "0000320193"

    async def test_lookup_cik_not_found(
        self, httpx_mock: HTTPXMock, tickers_response: dict
    ) -> None:
        """Test looking up CIK for unknown ticker."""
        httpx_mock.add_response(json=tickers_response)

        async with EdgarClient() as client:
            cik = await client.lookup_cik("UNKNOWN")
            assert cik is None


class TestGetCompany:
    """Tests for getting company information."""

    @pytest.fixture
    def company_response(self) -> dict:
        """Sample company submission response."""
        return {
            "cik": "320193",
            "name": "Apple Inc.",
            "tickers": ["AAPL"],
            "sic": "3571",
            "sicDescription": "Electronic Computers",
            "fiscalYearEnd": "0928",
            "stateOfIncorporation": "CA",
            "filings": {"recent": {}},
        }

    @pytest.fixture
    def tickers_response(self) -> dict:
        """Sample company tickers response."""
        return {"0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}}

    async def test_get_company_by_ticker(
        self, httpx_mock: HTTPXMock, company_response: dict, tickers_response: dict
    ) -> None:
        """Test getting company by ticker."""
        httpx_mock.add_response(json=tickers_response)
        httpx_mock.add_response(json=company_response)

        async with EdgarClient() as client:
            company = await client.get_company("AAPL")
            assert company is not None
            assert company.name == "Apple Inc."
            assert company.ticker == "AAPL"
            assert company.sic == "3571"

    async def test_get_company_by_cik(self, httpx_mock: HTTPXMock, company_response: dict) -> None:
        """Test getting company by CIK."""
        httpx_mock.add_response(json=company_response)

        async with EdgarClient() as client:
            company = await client.get_company("320193")
            assert company is not None
            assert company.name == "Apple Inc."

    async def test_get_company_not_found(self, httpx_mock: HTTPXMock) -> None:
        """Test getting non-existent company."""
        httpx_mock.add_response(status_code=404)

        async with EdgarClient() as client:
            company = await client.get_company("9999999999")
            assert company is None


class TestGetFilings:
    """Tests for getting filings."""

    @pytest.fixture
    def filings_response(self) -> dict:
        """Sample filings response."""
        return {
            "cik": "320193",
            "name": "Apple Inc.",
            "tickers": ["AAPL"],
            "filings": {
                "recent": {
                    "accessionNumber": [
                        "0000320193-24-000081",
                        "0000320193-24-000071",
                        "0000320193-24-000065",
                    ],
                    "form": ["10-K", "8-K", "10-Q"],
                    "filingDate": ["2024-11-01", "2024-10-31", "2024-08-02"],
                    "reportDate": ["2024-09-28", "2024-10-31", "2024-06-29"],
                    "primaryDocument": [
                        "aapl-20240928.htm",
                        "aapl-20241031.htm",
                        "aapl-20240629.htm",
                    ],
                    "primaryDocDescription": ["10-K", "8-K", "10-Q"],
                    "items": ["", "2.02,9.01", ""],
                    "size": [1234567, 123456, 987654],
                }
            },
        }

    async def test_get_filings_all_types(
        self, httpx_mock: HTTPXMock, filings_response: dict
    ) -> None:
        """Test getting all filings."""
        httpx_mock.add_response(json=filings_response)
        httpx_mock.add_response(json=filings_response)

        async with EdgarClient() as client:
            filings = await client.get_filings("320193")
            assert len(filings) == 3
            assert filings[0].filing_type == FilingType.FORM_10K
            assert filings[1].filing_type == FilingType.FORM_8K

    async def test_get_filings_filter_by_type(
        self, httpx_mock: HTTPXMock, filings_response: dict
    ) -> None:
        """Test filtering filings by type."""
        httpx_mock.add_response(json=filings_response)
        httpx_mock.add_response(json=filings_response)

        async with EdgarClient() as client:
            filings = await client.get_filings("320193", filing_types=[FilingType.FORM_10K])
            assert len(filings) == 1
            assert filings[0].filing_type == FilingType.FORM_10K

    async def test_get_filings_filter_by_date(
        self, httpx_mock: HTTPXMock, filings_response: dict
    ) -> None:
        """Test filtering filings by date range."""
        httpx_mock.add_response(json=filings_response)
        httpx_mock.add_response(json=filings_response)

        async with EdgarClient() as client:
            filings = await client.get_filings(
                "320193",
                start_date=date(2024, 10, 1),
                end_date=date(2024, 10, 31),
            )
            assert len(filings) == 1
            assert filings[0].filed_date == date(2024, 10, 31)

    async def test_get_filings_with_limit(
        self, httpx_mock: HTTPXMock, filings_response: dict
    ) -> None:
        """Test limiting number of filings."""
        httpx_mock.add_response(json=filings_response)
        httpx_mock.add_response(json=filings_response)

        async with EdgarClient() as client:
            filings = await client.get_filings("320193", limit=2)
            assert len(filings) == 2

    async def test_get_filings_parses_items(
        self, httpx_mock: HTTPXMock, filings_response: dict
    ) -> None:
        """Test parsing 8-K items."""
        httpx_mock.add_response(json=filings_response)
        httpx_mock.add_response(json=filings_response)

        async with EdgarClient() as client:
            filings = await client.get_filings("320193", filing_types=[FilingType.FORM_8K])
            assert filings[0].items == ["2.02", "9.01"]


class TestGetFilingUrl:
    """Tests for filing URL generation."""

    async def test_get_filing_url(self, httpx_mock: HTTPXMock) -> None:
        """Test generating filing URL."""
        filings_response = {
            "cik": "320193",
            "name": "Apple Inc.",
            "tickers": ["AAPL"],
            "filings": {
                "recent": {
                    "accessionNumber": ["0000320193-24-000081"],
                    "form": ["10-K"],
                    "filingDate": ["2024-11-01"],
                    "reportDate": ["2024-09-28"],
                    "primaryDocument": ["aapl-20240928.htm"],
                    "primaryDocDescription": ["10-K"],
                    "items": [""],
                    "size": [1234567],
                }
            },
        }
        httpx_mock.add_response(json=filings_response)
        httpx_mock.add_response(json=filings_response)

        async with EdgarClient() as client:
            filings = await client.get_filings("320193")
            url = client.get_filing_url(filings[0])
            assert "Archives/edgar/data/320193" in url
            assert "000032019324000081" in url
            assert "aapl-20240928.htm" in url


class TestGetFilingHtml:
    """Tests for fetching filing HTML."""

    async def test_get_filing_html(self, httpx_mock: HTTPXMock) -> None:
        """Test fetching filing HTML content."""
        filings_response = {
            "cik": "320193",
            "name": "Apple Inc.",
            "tickers": ["AAPL"],
            "filings": {
                "recent": {
                    "accessionNumber": ["0000320193-24-000081"],
                    "form": ["10-K"],
                    "filingDate": ["2024-11-01"],
                    "reportDate": ["2024-09-28"],
                    "primaryDocument": ["aapl-20240928.htm"],
                    "primaryDocDescription": ["10-K"],
                    "items": [""],
                    "size": [1234567],
                }
            },
        }
        html_content = "<html><body><h1>Apple Inc. 10-K</h1></body></html>"

        httpx_mock.add_response(json=filings_response)
        httpx_mock.add_response(json=filings_response)
        httpx_mock.add_response(text=html_content)

        async with EdgarClient() as client:
            filings = await client.get_filings("320193")
            html = await client.get_filing_html(filings[0])
            assert "Apple Inc. 10-K" in html


class TestErrorHandling:
    """Tests for error handling."""

    async def test_rate_limit_error(self, httpx_mock: HTTPXMock) -> None:
        """Test rate limit error handling."""
        httpx_mock.add_response(status_code=429)

        async with EdgarClient() as client:
            with pytest.raises(RateLimitError):
                await client.lookup_cik("AAPL")

    async def test_not_found_error(self, httpx_mock: HTTPXMock) -> None:
        """Test not found error handling."""
        httpx_mock.add_response(status_code=404)

        async with EdgarClient() as client:
            with pytest.raises(NotFoundError):
                await client._get("https://data.sec.gov/nonexistent")  # noqa: SLF001
