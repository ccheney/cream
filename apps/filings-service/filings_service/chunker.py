"""Section-based chunking for SEC filings.

Chunks SEC filings by section with configurable overlap for RAG retrieval.
Uses element-type based chunking (by Item) which provides better retrieval
than fixed-size chunking per academic research.

Reference: https://arxiv.org/html/2402.05131v2
"""

from dataclasses import dataclass
from typing import Any

from .models import FilingType, ParsedFiling


@dataclass
class FilingChunk:
    """A chunk of a SEC filing."""

    chunk_id: str
    filing_id: str
    company_symbol: str
    filing_type: str
    filing_date: str
    section_name: str
    chunk_index: int
    chunk_text: str
    total_chunks: int


# Section display names for better agent understanding
SECTION_NAMES = {
    # 10-K sections
    "business": "Business Description",
    "risk_factors": "Risk Factors",
    "properties": "Properties",
    "legal_proceedings": "Legal Proceedings",
    "mda": "Management Discussion and Analysis",
    "financial_statements": "Financial Statements",
    "selected_financial_data": "Selected Financial Data",
    "quantitative_disclosures": "Quantitative Disclosures",
    "controls_procedures": "Controls and Procedures",
    # 10-Q sections
    "financial_statements_q": "Quarterly Financial Statements",
    "mda_q": "Quarterly MD&A",
    "quantitative_q": "Quantitative and Qualitative Disclosures",
    "controls_q": "Controls and Procedures",
    "legal_q": "Legal Proceedings",
    # 8-K items (dynamic - handled separately)
}

# Target chunk size in characters (roughly 500-1000 tokens)
TARGET_CHUNK_SIZE = 4000

# Maximum chunk size (hard limit)
MAX_CHUNK_SIZE = 8000

# Overlap between chunks when splitting long sections
CHUNK_OVERLAP = 200


def split_text_with_overlap(
    text: str,
    max_size: int = MAX_CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[str]:
    """Split text into chunks with overlap at paragraph boundaries.

    Args:
        text: Text to split.
        max_size: Maximum chunk size in characters.
        overlap: Number of characters to overlap between chunks.

    Returns:
        List of text chunks.
    """
    if len(text) <= max_size:
        return [text]

    chunks: list[str] = []
    paragraphs = text.split("\n\n")

    current_chunk = ""

    for para in paragraphs:
        # If adding this paragraph exceeds max size, save current chunk
        if current_chunk and len(current_chunk) + len(para) + 2 > max_size:
            chunks.append(current_chunk.strip())

            # Start new chunk with overlap from end of previous
            overlap_text = current_chunk[-overlap:] if len(current_chunk) > overlap else current_chunk
            current_chunk = overlap_text + "\n\n" + para
        else:
            if current_chunk:
                current_chunk += "\n\n" + para
            else:
                current_chunk = para

    # Add final chunk
    if current_chunk.strip():
        chunks.append(current_chunk.strip())

    # Handle case where a single paragraph is too long
    final_chunks: list[str] = []
    for chunk in chunks:
        if len(chunk) > max_size:
            # Split at sentence boundaries
            sentences = chunk.replace(". ", ".\n").split("\n")
            sub_chunk = ""
            for sentence in sentences:
                if len(sub_chunk) + len(sentence) + 1 > max_size:
                    if sub_chunk:
                        final_chunks.append(sub_chunk.strip())
                    sub_chunk = sentence
                else:
                    sub_chunk += " " + sentence if sub_chunk else sentence
            if sub_chunk:
                final_chunks.append(sub_chunk.strip())
        else:
            final_chunks.append(chunk)

    return final_chunks


def create_chunk_id(filing_id: str, section: str, index: int) -> str:
    """Create a unique chunk ID.

    Args:
        filing_id: Accession number of the filing.
        section: Section name.
        index: Chunk index within section.

    Returns:
        Unique chunk ID.
    """
    # Remove special characters from filing_id
    clean_id = filing_id.replace("-", "").replace("/", "")
    clean_section = section.replace(" ", "_").lower()
    return f"chunk_{clean_id}_{clean_section}_{index:03d}"


def chunk_parsed_filing(parsed: ParsedFiling) -> list[FilingChunk]:
    """Chunk a parsed filing into smaller pieces for RAG.

    Creates chunks based on sections, splitting large sections at paragraph
    boundaries with overlap to preserve context.

    Args:
        parsed: ParsedFiling object with extracted sections.

    Returns:
        List of FilingChunk objects.
    """
    chunks: list[FilingChunk] = []
    filing = parsed.filing

    filing_id = filing.accession_number
    company_symbol = filing.company.ticker or filing.company.cik
    filing_type = filing.filing_type.value
    filing_date = filing.filed_date.isoformat()

    chunk_index = 0

    # Process each section
    for section_key, section_text in parsed.sections.items():
        if not section_text or len(section_text.strip()) < 100:
            continue

        section_name = SECTION_NAMES.get(section_key, section_key.replace("_", " ").title())

        # Prepend section header for context
        header = f"## {section_name}\n\n"

        # Split if necessary
        text_chunks = split_text_with_overlap(section_text)

        for i, chunk_text in enumerate(text_chunks):
            # Add section context to chunk
            if len(text_chunks) > 1:
                chunk_header = f"{header}(Part {i + 1} of {len(text_chunks)})\n\n"
            else:
                chunk_header = header

            full_text = chunk_header + chunk_text

            chunks.append(FilingChunk(
                chunk_id=create_chunk_id(filing_id, section_key, chunk_index),
                filing_id=filing_id,
                company_symbol=company_symbol,
                filing_type=filing_type,
                filing_date=filing_date,
                section_name=section_name,
                chunk_index=chunk_index,
                chunk_text=full_text,
                total_chunks=0,  # Will be updated after all chunks created
            ))
            chunk_index += 1

    # Update total chunks count
    total = len(chunks)
    for chunk in chunks:
        chunk.total_chunks = total

    return chunks


def chunks_to_dicts(chunks: list[FilingChunk]) -> list[dict[str, Any]]:
    """Convert FilingChunk objects to serializable dicts.

    Args:
        chunks: List of FilingChunk objects.

    Returns:
        List of dicts suitable for JSON serialization.
    """
    return [
        {
            "chunk_id": c.chunk_id,
            "filing_id": c.filing_id,
            "company_symbol": c.company_symbol,
            "filing_type": c.filing_type,
            "filing_date": c.filing_date,
            "section_name": c.section_name,
            "chunk_index": c.chunk_index,
            "chunk_text": c.chunk_text,
            "total_chunks": c.total_chunks,
        }
        for c in chunks
    ]


def estimate_tokens(text: str) -> int:
    """Estimate token count for text.

    Rough estimate: ~4 characters per token for English text.

    Args:
        text: Text to estimate.

    Returns:
        Estimated token count.
    """
    return len(text) // 4
