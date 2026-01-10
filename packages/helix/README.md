# @cream/helix

TypeScript client for HelixDB integration in the Cream trading system.

## Overview

Provides:

- **Type-safe client** - Connection management, retry, health checks
- **Vector search** - Similar decisions, news, documents (~2ms)
- **Graph traversal** - Relationship exploration (<1ms)
- **GraphRAG retrieval** - Combined vector + graph with RRF
- **Mutations** - Create/update nodes

## Key Components

### Client

```typescript
import { createHelixClient, createHelixClientFromEnv } from "@cream/helix";

const client = createHelixClient({ host: "localhost", port: 6969 });
// or
const client = createHelixClientFromEnv();

const health = await client.healthCheck();
```

### Vector Search

```typescript
import { searchSimilarDecisions } from "@cream/helix";

const similar = await searchSimilarDecisions(client, embedding, {
  topK: 10,
  minSimilarity: 0.7,
});
```

### Graph Traversal

```typescript
import { traverse, getInfluencingEvents } from "@cream/helix";

const paths = await traverse(client, "decision-123", {
  maxDepth: 2,
  direction: "outgoing",
});

const events = await getInfluencingEvents(client, decisionId);
```

### Trade Memory Retrieval (GraphRAG)

```typescript
import { retrieveTradeMemories } from "@cream/helix";

const memories = await retrieveTradeMemories(client, marketSnapshot, embedding, {
  topK: 10,
  rrfK: 60,
  includeInfluencingEvents: true,
});
```

### Mutations

```typescript
import { upsertTradeDecision, createLifecycleEvent } from "@cream/helix";

await upsertTradeDecision(client, decision, embedding, "Claude-3.5-Sonnet");
await createLifecycleEvent(client, { event_type: "FILL", ... });
```

## Configuration

```bash
HELIX_HOST=localhost
HELIX_PORT=6969
HELIX_TIMEOUT=5000
HELIX_MAX_RETRIES=3
```

## Performance Targets

| Operation | Target |
|-----------|--------|
| Vector search | ~2ms |
| Graph traversal | <1ms |
| Node upsert | <100ms |
| Batch upsert | <5000ms |

## Dependencies

- `helix-ts` - HelixDB SDK
- `@cream/helix-schema` - Schema definitions
- `@cream/domain` - Trading types
