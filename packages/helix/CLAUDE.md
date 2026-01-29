# helix

HelixDB client for graph + vector search. Provides unified interface for storing and querying trading knowledge graph.

## Skills
Always activate: `modern-javascript`, `clean-ddd-hexagonal`

## Key Dependencies

- **helix-ts** - Official HelixDB TypeScript client
  - Use context7 for helix-ts API patterns, query builders, graph traversal
  - Web search for HelixDB graph schema design, vector similarity tuning

## Related Plans

- `/docs/plans/04-memory-helixdb.md` - Memory architecture
- `/docs/plans/34-graphrag-query-tool.md` - GraphRAG tool implementation

## Structure

- `src/client.ts` - HelixDB client wrapper
- `src/queries/` - Predefined graph queries
- `src/vector/` - Vector embedding and similarity search
