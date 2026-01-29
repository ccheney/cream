# external-context

News, sentiment, and fundamentals extraction pipeline. Ingests external signals and stores in HelixDB for GraphRAG queries.

## Skills
Always activate: `modern-javascript`, `clean-ddd-hexagonal`

## Key Dependencies

- **@cream/helix** - Graph + vector storage for news/sentiment nodes
  - Use context7 for HelixDB query patterns and graph traversal
  - Web search for sentiment analysis best practices and news API integrations

## Related Plans

- `/docs/plans/47-hybrid-sentiment-analysis.md` - LLM + statistical sentiment fusion

## Structure

- `src/news/` - News aggregation and parsing
- `src/sentiment/` - Sentiment scoring (LLM + lexicon)
- `src/fundamentals/` - Company fundamentals extraction
