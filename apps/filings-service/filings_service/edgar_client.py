"""SEC EDGAR API Client.

Async client for fetching SEC filings from data.sec.gov.
Uses the official SEC EDGAR REST APIs which are free and require no authentication.

API Documentation: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
"""

import asyncio
import contextlib
from datetime import date, datetime
from typing import Any

import httpx

from .models import Company, Filing, FilingType


class EdgarClientError(Exception):
    """Base exception for EDGAR client errors."""

    pass


class RateLimitError(EdgarClientError):
    """Raised when rate limited by SEC."""

    pass


class NotFoundError(EdgarClientError):
    """Raised when resource not found."""

    pass


class EdgarClient:
    """Async client for SEC EDGAR API.

    The SEC EDGAR API is free and requires no authentication.
    Rate limit: 10 requests per second (we use conservative 5/sec).

    Example:
        ```python
        async with EdgarClient() as client:
            company = await client.get_company("AAPL")
            filings = await client.get_filings("AAPL", filing_types=[FilingType.FORM_10K])
        ```
    """

    BASE_URL = "https://data.sec.gov"
    SUBMISSIONS_URL = f"{BASE_URL}/submissions"
    ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data"

    # SEC requires a User-Agent header with contact info
    USER_AGENT = "CreamTradingSystem contact@cream.dev"

    # Conservative rate limit (SEC allows 10/sec)
    REQUESTS_PER_SECOND = 5

    def __init__(self, timeout: float = 30.0) -> None:
        """Initialize the EDGAR client.

        Args:
            timeout: Request timeout in seconds.
        """
        self._client: httpx.AsyncClient | None = None
        self._timeout = timeout
        self._last_request_time = 0.0
        self._request_count = 0

    async def __aenter__(self) -> EdgarClient:
        """Enter async context."""
        self._client = httpx.AsyncClient(
            timeout=self._timeout,
            headers={"User-Agent": self.USER_AGENT},
            follow_redirects=True,
        )
        return self

    async def __aexit__(self, *args: Any) -> None:
        """Exit async context."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _rate_limit(self) -> None:
        """Enforce rate limiting."""
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_request_time

        if elapsed < 1.0:
            self._request_count += 1
            if self._request_count >= self.REQUESTS_PER_SECOND:
                wait_time = 1.0 - elapsed
                await asyncio.sleep(wait_time)
                self._request_count = 0
        else:
            self._request_count = 1

        self._last_request_time = asyncio.get_event_loop().time()

    async def _get(self, url: str) -> dict[str, Any]:
        """Make a GET request with rate limiting.

        Args:
            url: URL to fetch.

        Returns:
            JSON response as dict.

        Raises:
            EdgarClientError: On request errors.
            RateLimitError: When rate limited.
            NotFoundError: When resource not found.
        """
        if not self._client:
            msg = "Client not initialized. Use 'async with EdgarClient() as client:'"
            raise EdgarClientError(msg)

        await self._rate_limit()

        try:
            response = await self._client.get(url)

            if response.status_code == 429:
                raise RateLimitError("Rate limited by SEC EDGAR")

            if response.status_code == 404:
                raise NotFoundError(f"Resource not found: {url}")

            response.raise_for_status()
            return response.json()

        except httpx.HTTPStatusError as e:
            raise EdgarClientError(f"HTTP error: {e}") from e
        except httpx.RequestError as e:
            raise EdgarClientError(f"Request error: {e}") from e

    async def _get_html(self, url: str) -> str:
        """Fetch HTML content.

        Args:
            url: URL to fetch.

        Returns:
            HTML content as string.
        """
        if not self._client:
            msg = "Client not initialized"
            raise EdgarClientError(msg)

        await self._rate_limit()

        try:
            response = await self._client.get(url)
            response.raise_for_status()
            return response.text

        except httpx.HTTPStatusError as e:
            raise EdgarClientError(f"HTTP error: {e}") from e

    @staticmethod
    def _normalize_cik(cik: str) -> str:
        """Normalize CIK to 10-digit zero-padded format.

        Args:
            cik: CIK number (with or without leading zeros).

        Returns:
            Zero-padded 10-digit CIK.
        """
        # Remove any leading zeros and re-pad
        return cik.lstrip("0").zfill(10)

    async def lookup_cik(self, ticker: str) -> str | None:
        """Look up CIK for a ticker symbol.

        Args:
            ticker: Stock ticker symbol.

        Returns:
            CIK if found, None otherwise.
        """
        # SEC provides a ticker-to-CIK mapping
        url = f"{self.BASE_URL}/files/company_tickers.json"

        try:
            data = await self._get(url)

            # Data is in format: {"0": {"cik_str": "...", "ticker": "...", "title": "..."}, ...}
            for entry in data.values():
                if entry.get("ticker", "").upper() == ticker.upper():
                    return self._normalize_cik(str(entry["cik_str"]))

            return None

        except EdgarClientError:
            return None

    async def get_company(self, ticker_or_cik: str) -> Company | None:
        """Get company information.

        Args:
            ticker_or_cik: Ticker symbol or CIK number.

        Returns:
            Company info if found, None otherwise.
        """
        # Determine if input is ticker or CIK
        if ticker_or_cik.isdigit():
            cik = self._normalize_cik(ticker_or_cik)
        else:
            cik = await self.lookup_cik(ticker_or_cik)
            if not cik:
                return None

        url = f"{self.SUBMISSIONS_URL}/CIK{cik}.json"

        try:
            data = await self._get(url)

            # Extract ticker from exchanges data
            ticker = None
            tickers = data.get("tickers", [])
            if tickers:
                ticker = tickers[0]

            return Company(
                cik=cik,
                name=data.get("name", ""),
                ticker=ticker,
                sic=data.get("sic"),
                sic_description=data.get("sicDescription"),
                fiscal_year_end=data.get("fiscalYearEnd"),
                state_of_incorporation=data.get("stateOfIncorporation"),
            )

        except NotFoundError:
            return None

    async def get_filings(
        self,
        ticker_or_cik: str,
        filing_types: list[FilingType] | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        limit: int = 100,
    ) -> list[Filing]:
        """Get filings for a company.

        Args:
            ticker_or_cik: Ticker symbol or CIK number.
            filing_types: Filter by filing types.
            start_date: Filter filings on or after this date.
            end_date: Filter filings on or before this date.
            limit: Maximum number of filings to return.

        Returns:
            List of filings matching criteria.
        """
        # Get company first to get CIK
        if ticker_or_cik.isdigit():
            cik = self._normalize_cik(ticker_or_cik)
            company = await self.get_company(cik)
        else:
            company = await self.get_company(ticker_or_cik)
            if not company:
                return []
            cik = company.cik

        if not company:
            return []

        url = f"{self.SUBMISSIONS_URL}/CIK{cik}.json"
        data = await self._get(url)

        filings: list[Filing] = []
        recent = data.get("filings", {}).get("recent", {})

        # Extract filing data from parallel arrays
        accession_numbers = recent.get("accessionNumber", [])
        forms = recent.get("form", [])
        filing_dates = recent.get("filingDate", [])
        report_dates = recent.get("reportDate", [])
        primary_documents = recent.get("primaryDocument", [])
        primary_descriptions = recent.get("primaryDocDescription", [])
        items_list = recent.get("items", [])
        sizes = recent.get("size", [])

        filing_type_values = [ft.value for ft in (filing_types or [])]

        for i, accession in enumerate(accession_numbers):
            if len(filings) >= limit:
                break

            form = forms[i] if i < len(forms) else None

            # Filter by filing type
            if filing_types and form not in filing_type_values:
                continue

            # Parse and filter by date
            try:
                filed_date_str = filing_dates[i] if i < len(filing_dates) else None
                if filed_date_str:
                    filed = datetime.strptime(filed_date_str, "%Y-%m-%d").date()
                else:
                    continue

                if start_date and filed < start_date:
                    continue
                if end_date and filed > end_date:
                    continue

            except ValueError:
                continue

            # Parse report date
            report_date = None
            if i < len(report_dates) and report_dates[i]:
                with contextlib.suppress(ValueError):
                    report_date = datetime.strptime(report_dates[i], "%Y-%m-%d").date()

            # Map form string to FilingType enum
            try:
                filing_type = FilingType(form)
            except ValueError:
                continue  # Skip unsupported filing types

            # Parse items (for 8-K filings)
            items: list[str] = []
            if i < len(items_list) and items_list[i]:
                items = [item.strip() for item in items_list[i].split(",") if item.strip()]

            filings.append(
                Filing(
                    accession_number=accession,
                    filing_type=filing_type,
                    filed_date=filed,
                    report_date=report_date,
                    company=company,
                    primary_document=primary_documents[i] if i < len(primary_documents) else "",
                    primary_document_description=(
                        primary_descriptions[i] if i < len(primary_descriptions) else None
                    ),
                    form_name=form,
                    items=items,
                    size=sizes[i] if i < len(sizes) else None,
                )
            )

        return filings

    def get_filing_url(self, filing: Filing) -> str:
        """Get URL to the primary document of a filing.

        Args:
            filing: Filing to get URL for.

        Returns:
            URL to the primary document.
        """
        cik = filing.company.cik.lstrip("0")
        accession_clean = filing.accession_number.replace("-", "")
        return f"{self.ARCHIVES_URL}/{cik}/{accession_clean}/{filing.primary_document}"

    async def get_filing_html(self, filing: Filing) -> str:
        """Fetch the HTML content of a filing.

        Args:
            filing: Filing to fetch.

        Returns:
            HTML content as string.
        """
        url = self.get_filing_url(filing)
        return await self._get_html(url)
