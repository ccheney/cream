# helix-schema

HelixDB schema definitions for trading knowledge graph (stocks, options, news, filings, indicators, regimes, decisions).

## Skills
Always activate: `modern-javascript`

## Key Dependencies

- **@google/genai** - Embedding generation for vector nodes
  - Use context7 for Gemini embedding models (text-embedding-004)
  - Web search for HelixDB schema migration patterns

## Related Plans

- `/docs/plans/04-memory-helixdb.md` - Knowledge graph schema

## Structure

- `src/nodes/` - Node type definitions (stock, news, filing, etc.)
- `src/edges/` - Relationship type definitions
- `src/migrations/` - Schema versioning and migrations
