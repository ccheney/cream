"""Tests for filing parsers."""

from datetime import date

from filings_service.models import Company, Filing, FilingType
from filings_service.parsers import (
    FilingParser,
    Form8KParser,
    Form10KParser,
    Form10QParser,
    get_parser,
    parse_filing,
)


def create_filing(filing_type: FilingType = FilingType.FORM_10K) -> Filing:
    """Create a test filing."""
    company = Company(cik="0000320193", name="Apple Inc.", ticker="AAPL")
    return Filing(
        accession_number="0000320193-24-000081",
        filing_type=filing_type,
        filed_date=date(2024, 11, 1),
        report_date=date(2024, 9, 28),
        company=company,
        primary_document="test.htm",
    )


class TestFilingParser:
    """Tests for base FilingParser."""

    def test_extract_text_removes_scripts(self) -> None:
        """Test that scripts are removed from text extraction."""
        html = """
        <html>
        <head><script>alert('test');</script></head>
        <body>
            <script>console.log('test');</script>
            <p>This is the content.</p>
        </body>
        </html>
        """
        filing = create_filing()
        parser = FilingParser(filing, html)
        text = parser.extract_text()

        assert "This is the content" in text
        assert "alert" not in text
        assert "console.log" not in text

    def test_extract_text_removes_styles(self) -> None:
        """Test that styles are removed from text extraction."""
        html = """
        <html>
        <head><style>body { color: red; }</style></head>
        <body><p>Content here.</p></body>
        </html>
        """
        filing = create_filing()
        parser = FilingParser(filing, html)
        text = parser.extract_text()

        assert "Content here" in text
        assert "color: red" not in text

    def test_extract_text_collapses_whitespace(self) -> None:
        """Test that whitespace is collapsed."""
        html = """
        <html>
        <body>
            <p>Word1     Word2


            Word3</p>
        </body>
        </html>
        """
        filing = create_filing()
        parser = FilingParser(filing, html)
        text = parser.extract_text()

        assert "Word1 Word2 Word3" in text

    def test_extract_sections(self) -> None:
        """Test section extraction."""
        html = """
        <html><body>
            <h1>ITEM 1. BUSINESS</h1>
            <p>We design and sell consumer electronics.</p>
            <h1>ITEM 1A. RISK FACTORS</h1>
            <p>Our business is subject to various risks.</p>
            <h1>ITEM 2. PROPERTIES</h1>
            <p>We own various properties.</p>
        </body></html>
        """
        filing = create_filing()
        parser = FilingParser(filing, html)
        sections = parser.extract_sections()

        assert "business" in sections
        assert "consumer electronics" in sections["business"]
        assert "risk_factors" in sections
        assert "various risks" in sections["risk_factors"]

    def test_extract_tables(self) -> None:
        """Test table extraction."""
        html = """
        <html><body>
            <table>
                <tr><th>Year</th><th>Revenue</th></tr>
                <tr><td>2024</td><td>$394B</td></tr>
                <tr><td>2023</td><td>$383B</td></tr>
            </table>
        </body></html>
        """
        filing = create_filing()
        parser = FilingParser(filing, html)
        tables = parser.extract_tables()

        assert len(tables) == 1
        assert tables[0]["headers"] == ["Year", "Revenue"]
        assert len(tables[0]["rows"]) == 2
        assert tables[0]["rows"][0] == ["2024", "$394B"]

    def test_extract_tables_skips_empty(self) -> None:
        """Test that empty tables are skipped."""
        html = """
        <html><body>
            <table>
                <tr></tr>
            </table>
            <table>
                <tr><th>Data</th></tr>
                <tr><td>Value</td></tr>
            </table>
        </body></html>
        """
        filing = create_filing()
        parser = FilingParser(filing, html)
        tables = parser.extract_tables()

        assert len(tables) == 1

    def test_parse_returns_parsed_filing(self) -> None:
        """Test full parse returns ParsedFiling."""
        html = "<html><body><p>Test content</p></body></html>"
        filing = create_filing()
        parser = FilingParser(filing, html)
        result = parser.parse()

        assert result.filing == filing
        assert result.raw_html == html
        assert "Test content" in result.extracted_text
        assert result.extracted_at is not None


class TestForm10KParser:
    """Tests for 10-K parser."""

    def test_extracts_10k_sections(self) -> None:
        """Test 10-K specific section extraction."""
        html = """
        <html><body>
            <h1>ITEM 6. SELECTED FINANCIAL DATA</h1>
            <p>Five year summary of financial data.</p>
            <h1>ITEM 7. MANAGEMENT'S DISCUSSION</h1>
            <p>Overview of financial condition.</p>
            <h1>ITEM 7A. QUANTITATIVE</h1>
            <p>Market risk disclosures.</p>
        </body></html>
        """
        filing = create_filing(FilingType.FORM_10K)
        parser = Form10KParser(filing, html)
        sections = parser.extract_sections()

        assert "selected_financial_data" in sections
        assert "mda" in sections
        assert "quantitative_disclosures" in sections


class TestForm10QParser:
    """Tests for 10-Q parser."""

    def test_extracts_10q_sections(self) -> None:
        """Test 10-Q specific section extraction."""
        html = """
        <html><body>
            <h1>PART I ITEM 1. FINANCIAL STATEMENTS</h1>
            <p>Quarterly financial statements.</p>
            <h1>ITEM 2. MANAGEMENT'S DISCUSSION</h1>
            <p>Quarterly analysis.</p>
            <h1>ITEM 4. CONTROLS</h1>
            <p>Control procedures.</p>
        </body></html>
        """
        filing = create_filing(FilingType.FORM_10Q)
        parser = Form10QParser(filing, html)
        sections = parser.extract_sections()

        assert "financial_statements" in sections
        assert "mda" in sections
        assert "controls_procedures" in sections


class TestForm8KParser:
    """Tests for 8-K parser."""

    def test_extracts_8k_items(self) -> None:
        """Test 8-K item extraction."""
        html = """
        <html><body>
            <h1>ITEM 2.02 Results of Operations and Financial Condition</h1>
            <p>On October 31, 2024, we announced quarterly results.</p>
            <h1>ITEM 9.01 Financial Statements and Exhibits</h1>
            <p>Exhibit 99.1: Press release.</p>
            <h1>SIGNATURES</h1>
            <p>Signed by CEO.</p>
        </body></html>
        """
        filing = create_filing(FilingType.FORM_8K)
        parser = Form8KParser(filing, html)
        items = parser.extract_items()

        assert len(items) == 2
        assert items[0].item_number == "2.02"
        assert items[0].item_title == "Results of Operations and Financial Condition"
        assert "quarterly results" in items[0].content
        assert items[1].item_number == "9.01"

    def test_parse_adds_items_to_sections(self) -> None:
        """Test that parse adds items to sections dict."""
        html = """
        <html><body>
            <h1>ITEM 5.02 Departure of Directors</h1>
            <p>CFO resigned effective immediately.</p>
            <h1>SIGNATURES</h1>
        </body></html>
        """
        filing = create_filing(FilingType.FORM_8K)
        parser = Form8KParser(filing, html)
        result = parser.parse()

        assert "item_5_02" in result.sections
        assert "CFO resigned" in result.sections["item_5_02"]


class TestGetParser:
    """Tests for get_parser factory function."""

    def test_returns_10k_parser(self) -> None:
        """Test returns Form10KParser for 10-K."""
        filing = create_filing(FilingType.FORM_10K)
        parser = get_parser(filing, "<html></html>")
        assert isinstance(parser, Form10KParser)

    def test_returns_10q_parser(self) -> None:
        """Test returns Form10QParser for 10-Q."""
        filing = create_filing(FilingType.FORM_10Q)
        parser = get_parser(filing, "<html></html>")
        assert isinstance(parser, Form10QParser)

    def test_returns_8k_parser(self) -> None:
        """Test returns Form8KParser for 8-K."""
        filing = create_filing(FilingType.FORM_8K)
        parser = get_parser(filing, "<html></html>")
        assert isinstance(parser, Form8KParser)

    def test_returns_base_parser_for_unknown(self) -> None:
        """Test returns base parser for unknown types."""
        filing = create_filing(FilingType.FORM_DEF14A)
        parser = get_parser(filing, "<html></html>")
        assert type(parser) is FilingParser


class TestParseFiling:
    """Tests for parse_filing convenience function."""

    def test_parse_filing(self) -> None:
        """Test parse_filing convenience function."""
        html = "<html><body><p>Annual report content.</p></body></html>"
        filing = create_filing(FilingType.FORM_10K)
        result = parse_filing(filing, html)

        assert result.filing == filing
        assert "Annual report content" in result.extracted_text
