"""Filing parsers for extracting structured data from SEC filings.

Provides parsers for 10-K, 10-Q, and 8-K filings using BeautifulSoup.
"""

import re
from datetime import datetime
from typing import Any

from bs4 import BeautifulSoup

from .models import Filing, FilingType, Form8KItem, ParsedFiling


class FilingParser:
    """Base parser for SEC filings."""

    # Common section headers to extract
    COMMON_SECTIONS = {
        "business": r"item\s*1[.\s]*business",
        "risk_factors": r"item\s*1a[.\s]*risk\s*factors",
        "properties": r"item\s*2[.\s]*properties",
        "legal_proceedings": r"item\s*3[.\s]*legal\s*proceedings",
        "mda": r"item\s*7[.\s]*management.s\s*discussion",
        "financial_statements": r"item\s*8[.\s]*financial\s*statements",
    }

    def __init__(self, filing: Filing, html: str) -> None:
        """Initialize parser.

        Args:
            filing: Filing metadata.
            html: Raw HTML content.
        """
        self.filing = filing
        self.html = html
        self.soup = BeautifulSoup(html, "lxml")

    def extract_text(self) -> str:
        """Extract plain text from HTML.

        Returns:
            Plain text content.
        """
        # Remove script and style elements
        for element in self.soup(["script", "style", "head"]):
            element.decompose()

        # Get text and clean up whitespace
        text = self.soup.get_text(separator=" ")
        # Collapse multiple whitespace
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    def extract_sections(self) -> dict[str, str]:
        """Extract common sections from filing.

        Returns:
            Dict mapping section name to content.
        """
        text = self.extract_text()
        sections: dict[str, str] = {}

        section_patterns = list(self.COMMON_SECTIONS.items())

        for i, (section_name, pattern) in enumerate(section_patterns):
            match = re.search(pattern, text, re.IGNORECASE)
            if not match:
                continue

            start = match.end()

            # Find the end (next section or end of document)
            end = len(text)
            for _, next_pattern in section_patterns[i + 1 :]:
                next_match = re.search(next_pattern, text[start:], re.IGNORECASE)
                if next_match:
                    end = start + next_match.start()
                    break

            sections[section_name] = text[start:end].strip()[:50000]  # Limit size

        return sections

    def extract_tables(self) -> list[dict[str, Any]]:
        """Extract tables from HTML.

        Returns:
            List of tables as dicts with headers and rows.
        """
        tables: list[dict[str, Any]] = []

        for table in self.soup.find_all("table"):
            rows = table.find_all("tr")
            if not rows:
                continue

            # Extract headers from first row
            headers: list[str] = []
            first_row = rows[0]
            for cell in first_row.find_all(["th", "td"]):
                text = cell.get_text(strip=True)
                headers.append(text)

            if not headers:
                continue

            # Extract data rows
            data_rows: list[list[str]] = []
            for row in rows[1:]:
                cells = row.find_all(["td", "th"])
                row_data = [cell.get_text(strip=True) for cell in cells]
                if row_data and any(row_data):  # Skip empty rows
                    data_rows.append(row_data)

            if data_rows:
                tables.append({"headers": headers, "rows": data_rows})

        return tables[:20]  # Limit number of tables

    def parse(self) -> ParsedFiling:
        """Parse the filing.

        Returns:
            ParsedFiling with extracted content.
        """
        return ParsedFiling(
            filing=self.filing,
            raw_html=self.html,
            extracted_text=self.extract_text()[:100000],  # Limit size
            sections=self.extract_sections(),
            financial_tables=self.extract_tables(),
            extracted_at=datetime.utcnow(),
        )


class Form10KParser(FilingParser):
    """Parser for 10-K annual reports."""

    SECTIONS_10K = {
        **FilingParser.COMMON_SECTIONS,
        "selected_financial_data": r"item\s*6[.\s]*selected\s*financial",
        "quantitative_disclosures": r"item\s*7a[.\s]*quantitative",
        "controls_procedures": r"item\s*9a[.\s]*controls\s*and\s*procedures",
    }

    def extract_sections(self) -> dict[str, str]:
        """Extract 10-K specific sections."""
        text = self.extract_text()
        sections: dict[str, str] = {}

        section_patterns = list(self.SECTIONS_10K.items())

        for i, (section_name, pattern) in enumerate(section_patterns):
            match = re.search(pattern, text, re.IGNORECASE)
            if not match:
                continue

            start = match.end()
            end = len(text)

            for _, next_pattern in section_patterns[i + 1 :]:
                next_match = re.search(next_pattern, text[start:], re.IGNORECASE)
                if next_match:
                    end = start + next_match.start()
                    break

            sections[section_name] = text[start:end].strip()[:50000]

        return sections


class Form10QParser(FilingParser):
    """Parser for 10-Q quarterly reports."""

    SECTIONS_10Q = {
        "financial_statements": r"part\s*i[.\s]*item\s*1[.\s]*financial",
        "mda": r"item\s*2[.\s]*management.s\s*discussion",
        "quantitative_disclosures": r"item\s*3[.\s]*quantitative",
        "controls_procedures": r"item\s*4[.\s]*controls",
        "legal_proceedings": r"part\s*ii[.\s]*item\s*1[.\s]*legal",
        "risk_factors": r"item\s*1a[.\s]*risk\s*factors",
    }

    def extract_sections(self) -> dict[str, str]:
        """Extract 10-Q specific sections."""
        text = self.extract_text()
        sections: dict[str, str] = {}

        section_patterns = list(self.SECTIONS_10Q.items())

        for i, (section_name, pattern) in enumerate(section_patterns):
            match = re.search(pattern, text, re.IGNORECASE)
            if not match:
                continue

            start = match.end()
            end = len(text)

            for _, next_pattern in section_patterns[i + 1 :]:
                next_match = re.search(next_pattern, text[start:], re.IGNORECASE)
                if next_match:
                    end = start + next_match.start()
                    break

            sections[section_name] = text[start:end].strip()[:50000]

        return sections


class Form8KParser(FilingParser):
    """Parser for 8-K current reports (material events)."""

    # 8-K item numbers and their descriptions
    ITEMS_8K = {
        "1.01": "Entry into a Material Definitive Agreement",
        "1.02": "Termination of a Material Definitive Agreement",
        "1.03": "Bankruptcy or Receivership",
        "2.01": "Completion of Acquisition or Disposition of Assets",
        "2.02": "Results of Operations and Financial Condition",
        "2.03": "Creation of a Direct Financial Obligation",
        "2.04": "Triggering Events That Accelerate an Obligation",
        "2.05": "Costs Associated with Exit or Disposal Activities",
        "2.06": "Material Impairments",
        "3.01": "Notice of Delisting",
        "3.02": "Unregistered Sales of Equity Securities",
        "3.03": "Material Modification to Rights of Security Holders",
        "4.01": "Changes in Registrant's Certifying Accountant",
        "4.02": "Non-Reliance on Previously Issued Financial Statements",
        "5.01": "Changes in Control of Registrant",
        "5.02": "Departure of Directors or Officers",
        "5.03": "Amendments to Articles of Incorporation or Bylaws",
        "5.04": "Temporary Suspension of Trading",
        "5.05": "Amendments to the Registrant's Code of Ethics",
        "5.06": "Change in Shell Company Status",
        "5.07": "Submission of Matters to a Vote of Security Holders",
        "5.08": "Shareholder Nominations",
        "7.01": "Regulation FD Disclosure",
        "8.01": "Other Events",
        "9.01": "Financial Statements and Exhibits",
    }

    def extract_items(self) -> list[Form8KItem]:
        """Extract 8-K items from the filing.

        Returns:
            List of Form8KItem objects.
        """
        text = self.extract_text()
        items: list[Form8KItem] = []

        # Pattern to find item numbers like "Item 2.02" or "ITEM 5.02"
        item_pattern = r"item\s*(\d+\.\d+)"
        matches = list(re.finditer(item_pattern, text, re.IGNORECASE))

        for i, match in enumerate(matches):
            item_number = match.group(1)
            item_title = self.ITEMS_8K.get(item_number, "Unknown Item")

            # Extract content until next item or end
            start = match.end()
            if i + 1 < len(matches):
                end = matches[i + 1].start()
            else:
                # Find signature section as end marker
                sig_match = re.search(r"signatures?", text[start:], re.IGNORECASE)
                end = start + sig_match.start() if sig_match else len(text)

            content = text[start:end].strip()[:10000]  # Limit size

            items.append(
                Form8KItem(
                    item_number=item_number,
                    item_title=item_title,
                    content=content,
                )
            )

        return items

    def parse(self) -> ParsedFiling:
        """Parse 8-K filing with items."""
        parsed = super().parse()

        # Extract 8-K specific items
        items = self.extract_items()

        # Add items to sections
        for item in items:
            section_key = f"item_{item.item_number.replace('.', '_')}"
            parsed.sections[section_key] = item.content

        return parsed


def get_parser(filing: Filing, html: str) -> FilingParser:
    """Get the appropriate parser for a filing type.

    Args:
        filing: Filing metadata.
        html: Raw HTML content.

    Returns:
        Parser instance for the filing type.
    """
    parser_map = {
        FilingType.FORM_10K: Form10KParser,
        FilingType.FORM_10Q: Form10QParser,
        FilingType.FORM_8K: Form8KParser,
    }

    parser_class = parser_map.get(filing.filing_type, FilingParser)
    return parser_class(filing, html)


def parse_filing(filing: Filing, html: str) -> ParsedFiling:
    """Parse a filing and extract structured content.

    Args:
        filing: Filing metadata.
        html: Raw HTML content.

    Returns:
        ParsedFiling with extracted content.
    """
    parser = get_parser(filing, html)
    return parser.parse()
