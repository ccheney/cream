# filings

SEC EDGAR filing ingestion for 10-K, 10-Q, 8-K forms. Parses XBRL and HTML filings, extracts key sections, stores in HelixDB.

## Skills
Always activate: `modern-javascript`, `clean-ddd-hexagonal`

## Key Dependencies

- **sec-edgar-toolkit** - EDGAR API client and XBRL parsing
- **cheerio** - HTML parsing for filing sections
  - Use context7 for sec-edgar-toolkit API patterns
  - Web search for SEC EDGAR API rate limits, XBRL taxonomy updates

## Related Plans

- `/docs/plans/02-data-layer.md` - Data ingestion architecture

## Structure

- `src/ingest/` - EDGAR API client and filing download
- `src/parse/` - XBRL and HTML parsing logic
- `src/extract/` - Key section extraction (MD&A, risk factors)
