# Mastra

OODA trading loop with 9 LLM agents and 3 workflows running hourly cycles.

## Skills
Always activate: `modern-javascript`, `ai-sdk`, `clean-ddd-hexagonal`

## Key Dependencies
- **Mastra v1.0** → use context7 for `mastra` docs
- **AI SDK** → use context7 for `ai-sdk` (Vercel AI SDK) docs
- **@ai-sdk/google**, **@ai-sdk/xai** — LLM providers
- **@connectrpc/connect** — gRPC client to execution engine

## Related Plans
- [docs/plans/05-agents.md](../../docs/plans/05-agents.md)
- [docs/plans/30-mastra-workflow-refactor.md](../../docs/plans/30-mastra-workflow-refactor.md)
- [docs/plans/53-mastra-v1-migration.md](../../docs/plans/53-mastra-v1-migration.md)
- [docs/plans/50-runtime-constraints-to-agents.md](../../docs/plans/50-runtime-constraints-to-agents.md)

## Notes
- Agents defined in `packages/agents/`
- DecisionPlan contract in `packages/domain/`
- Protobuf stubs from `packages/schema-gen/`
